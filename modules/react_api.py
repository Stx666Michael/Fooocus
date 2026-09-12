from __future__ import annotations

import base64
import binascii
import csv
import io
import json
import math
import mimetypes
import os
import platform
import random
import re
import shutil
import subprocess
import urllib.parse
import webbrowser
import zipfile
from html.parser import HTMLParser
from uuid import uuid4
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import numpy as np
import psutil
from PIL import Image

import args_manager
import fooocus_version
import modules.async_worker as worker
import modules.config as config
import modules.flags as flags
import modules.sdxl_styles as sdxl_styles
from modules.flags import MetadataScheme, Performance


PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC_ROOT = PROJECT_ROOT / 'static'
MAX_REQUEST_BYTES = 100 * 1024 * 1024
LIBRARY_IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp'}


def _number_or_none(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _nvidia_smi_path() -> str | None:
    executable = shutil.which('nvidia-smi')
    if executable:
        return executable
    if os.name == 'nt':
        for root in (os.environ.get('ProgramFiles'), os.environ.get('ProgramFiles(x86)')):
            if root:
                candidate = Path(root) / 'NVIDIA Corporation' / 'NVSMI' / 'nvidia-smi.exe'
                if candidate.is_file():
                    return str(candidate)
    return None


def _nvidia_gpu_status() -> dict[str, Any] | None:
    executable = _nvidia_smi_path()
    if executable is None:
        return None
    try:
        result = subprocess.run(
            [
                executable,
                '--query-gpu=index,name,utilization.gpu,memory.used,memory.total',
                '--format=csv,noheader,nounits',
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=1.5,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    rows = list(csv.reader(line for line in result.stdout.splitlines() if line.strip()))
    if not rows:
        return None
    row = rows[0]
    if len(row) < 5:
        return None
    usage = _number_or_none(row[2].strip())
    memory_used_mb = _number_or_none(row[3].strip())
    memory_total_mb = _number_or_none(row[4].strip())
    memory_percent = None
    if memory_used_mb is not None and memory_total_mb:
        memory_percent = round(memory_used_mb / memory_total_mb * 100, 1)
    return {
        'available': True,
        'backend': 'CUDA',
        'name': row[1].strip(),
        'usagePercent': round(usage, 1) if usage is not None else None,
        'memoryUsedBytes': int(memory_used_mb * 1024 * 1024) if memory_used_mb is not None else None,
        'memoryTotalBytes': int(memory_total_mb * 1024 * 1024) if memory_total_mb is not None else None,
        'memoryPercent': memory_percent,
    }


def _torch_gpu_status() -> dict[str, Any] | None:
    try:
        import torch
    except ImportError:
        return None

    try:
        if not torch.cuda.is_available():
            return None
        device = torch.cuda.current_device()
        free_bytes, total_bytes = torch.cuda.mem_get_info(device)
        used_bytes = total_bytes - free_bytes
        return {
            'available': True,
            'backend': 'CUDA',
            'name': torch.cuda.get_device_name(device),
            'usagePercent': None,
            'memoryUsedBytes': used_bytes,
            'memoryTotalBytes': total_bytes,
            'memoryPercent': round(used_bytes / total_bytes * 100, 1) if total_bytes else None,
        }
    except (AttributeError, RuntimeError, AssertionError):
        return None


def _system_cpu_name() -> str:
    if os.name == 'nt':
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r'HARDWARE\DESCRIPTION\System\CentralProcessor\0',
            ) as key:
                value, _ = winreg.QueryValueEx(key, 'ProcessorNameString')
                if isinstance(value, str) and value.strip():
                    return re.sub(r'\s+', ' ', value.replace('(R)', '').replace('(TM)', '').replace('(C)', '')).strip()
        except (ImportError, OSError):
            pass

    try:
        for line in Path('/proc/cpuinfo').read_text(encoding='utf-8', errors='replace').splitlines():
            if ':' not in line:
                continue
            label, value = line.split(':', 1)
            if label.strip().casefold() in ('model name', 'hardware') and value.strip():
                return re.sub(r'\s+', ' ', value.strip())
    except OSError:
        pass

    return platform.processor() or platform.uname().processor or platform.machine() or 'Unknown CPU'


def system_payload() -> dict[str, Any]:
    memory = psutil.virtual_memory()
    cpu_name = _system_cpu_name()
    cpu_cores = psutil.cpu_count(logical=True) or 1
    physical_cores = psutil.cpu_count(logical=False) or cpu_cores
    gpu = _nvidia_gpu_status() or _torch_gpu_status()
    if gpu is None:
        gpu = {
            'available': False,
            'backend': 'CPU',
            'name': 'No GPU detected',
            'usagePercent': None,
            'memoryUsedBytes': None,
            'memoryTotalBytes': None,
            'memoryPercent': None,
        }
    return {
        'platform': f'{platform.system()} {platform.release()}',
        'cpu': {
            'name': cpu_name,
            'usagePercent': round(psutil.cpu_percent(interval=0.1), 1),
            'cores': cpu_cores,
            'physicalCores': physical_cores,
        },
        'memory': {
            'usedBytes': memory.used,
            'totalBytes': memory.total,
            'availableBytes': memory.available,
            'usagePercent': round(memory.percent, 1),
        },
        'gpu': gpu,
    }


class _OutputLogParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.entries: list[dict[str, Any]] = []
        self._entry: dict[str, Any] | None = None
        self._container_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get('class') or '').split()
        if tag == 'div' and 'image-container' in classes:
            self._entry = {'href': None, 'metadata': {}}
            self._container_depth = 1
            return

        if self._entry is None:
            return
        if tag == 'div':
            self._container_depth += 1
        if tag in ('a', 'img') and not self._entry['href']:
            self._entry['href'] = attributes.get('href') or attributes.get('src')
        if tag == 'button':
            self._entry['metadata'] = self._metadata_from_button(attributes.get('onclick'))

    def handle_endtag(self, tag: str) -> None:
        if self._entry is None or tag != 'div':
            return
        self._container_depth -= 1
        if self._container_depth <= 0:
            self.entries.append(self._entry)
            self._entry = None
            self._container_depth = 0

    def close(self) -> None:
        super().close()
        if self._entry is not None:
            self.entries.append(self._entry)
            self._entry = None

    @staticmethod
    def _metadata_from_button(onclick: str | None) -> dict[str, Any]:
        marker = "to_clipboard('"
        if not onclick or marker not in onclick:
            return {}
        encoded = onclick.split(marker, 1)[1].split("')", 1)[0]
        try:
            metadata = json.loads(urllib.parse.unquote(encoded))
        except (ValueError, json.JSONDecodeError):
            return {}
        return metadata if isinstance(metadata, dict) else {}


def _strip_markup(value: str) -> str:
    result = value.replace('&times;', '×').replace('&vert;', '|')
    while '<' in result and '>' in result:
        start = result.find('<')
        end = result.find('>', start)
        if end == -1:
            break
        result = result[:start] + result[end + 1:]
    return ' '.join(result.split())


def _ratio_value(value: Any) -> str:
    if not isinstance(value, str):
        return config.default_aspect_ratio.split('×')[0] + '*' + config.default_aspect_ratio.split('×')[1].split()[0]

    cleaned = _strip_markup(value).replace('×', '*').replace('|', ' ')
    parts = cleaned.replace('*', ' ').split()
    if len(parts) < 2:
        return config.default_aspect_ratio.split('×')[0] + '*' + config.default_aspect_ratio.split('×')[1].split()[0]

    candidate = f'{parts[0]}*{parts[1]}'
    if candidate in config.available_aspect_ratios:
        return candidate
    return config.available_aspect_ratios[0]


def _safe_model(value: Any, available: list[str], default: str | None, allow_none: bool = False) -> str:
    if allow_none and value == 'None':
        return 'None'
    if allow_none and value in (None, '') and default in (None, 'None'):
        return 'None'
    if isinstance(value, str) and value in available:
        return value
    if allow_none and default == 'None':
        return 'None'
    if default in available:
        return default or ''
    return available[0] if available else (default or '')


def _safe_float(value: Any, default: float, minimum: float | None = None, maximum: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _safe_int(value: Any, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _decode_image(value: Any) -> np.ndarray | None:
    if not value:
        return None
    if isinstance(value, dict):
        value = value.get('data') or value.get('src')
    if not isinstance(value, str):
        raise ValueError('Image data must be a base64 data URL.')
    if ',' in value:
        _, encoded = value.split(',', 1)
    else:
        encoded = value
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError('Image data is not valid base64.') from error
    try:
        with Image.open(io.BytesIO(raw)) as image:
            return np.array(image.convert('RGB'))
    except (OSError, ValueError) as error:
        raise ValueError('Image data could not be decoded.') from error


def _image_data_url(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return _media_url(value)
    if isinstance(value, Image.Image):
        image = value
    elif isinstance(value, np.ndarray):
        image = Image.fromarray(value.astype(np.uint8))
    else:
        return None
    output = io.BytesIO()
    image.save(output, format='JPEG', quality=86)
    return 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode('ascii')


def _allowed_media_roots() -> list[Path]:
    roots = [Path(config.path_outputs).resolve(), Path(config.temp_path).resolve()]
    return [root for root in roots if root.exists()]


def _is_allowed_media(path: Path) -> bool:
    resolved = path.resolve()
    return any(resolved == root or root in resolved.parents for root in _allowed_media_roots())


def _media_url(value: str) -> str | None:
    path = Path(value)
    if not path.is_file() or not _is_allowed_media(path):
        return None
    return '/api/media?' + urllib.parse.urlencode({'path': str(path.resolve())})


def _serialize_result(value: Any) -> str | None:
    if isinstance(value, (str, Path)):
        return _media_url(str(value))
    return _image_data_url(value)


def _library_dimensions(path: Path, metadata: dict[str, Any]) -> tuple[int | None, int | None]:
    try:
        with Image.open(path) as image:
            return image.size
    except (OSError, ValueError):
        resolution = metadata.get('resolution')
        if isinstance(resolution, str):
            numbers = re.findall(r'\d+', resolution)
            if len(numbers) >= 2:
                return int(numbers[0]), int(numbers[1])
    return None, None


def _library_aspect_ratio(width: int | None, height: int | None) -> str | None:
    if not width or not height:
        return None
    divisor = math.gcd(width, height)
    return f'{width // divisor}:{height // divisor}'


def _library_operation(metadata: dict[str, Any]) -> str:
    operation = metadata.get('operation')
    if operation not in (None, '', 'None'):
        return str(operation)
    if metadata.get('upscale_fast') not in (None, '', False, 'None'):
        return 'Upscale'
    for key in ('uov_method', 'upscale_method', 'enhance_uov_method'):
        value = metadata.get(key)
        if value and str(value).casefold() not in ('disabled', 'none'):
            return 'Upscale'
    return 'Generation'


def library_payload() -> dict[str, Any]:
    output_root = Path(config.path_outputs).resolve()
    if not output_root.is_dir():
        return {'items': []}

    items_by_path: dict[str, dict[str, Any]] = {}

    for log_path in output_root.rglob('log.html'):
        try:
            parser = _OutputLogParser()
            parser.feed(log_path.read_text(encoding='utf-8', errors='replace'))
            parser.close()
        except OSError:
            continue

        for entry in parser.entries:
            href = entry.get('href')
            if not isinstance(href, str) or not href:
                continue
            image_path = (log_path.parent / urllib.parse.unquote(href)).resolve()
            if image_path.suffix.casefold() not in LIBRARY_IMAGE_SUFFIXES:
                continue
            if not image_path.is_file() or not _is_allowed_media(image_path):
                continue
            metadata = entry.get('metadata')
            items_by_path[str(image_path)] = {
                'path': image_path,
                'metadata': metadata if isinstance(metadata, dict) else {},
            }

    for path in output_root.rglob('*'):
        if not path.is_file() or path.suffix.casefold() not in LIBRARY_IMAGE_SUFFIXES:
            continue
        items_by_path.setdefault(str(path.resolve()), {'path': path.resolve(), 'metadata': {}})

    items: list[dict[str, Any]] = []
    for item in items_by_path.values():
        path = item['path']
        url = _media_url(str(path))
        if url is None:
            continue
        try:
            modified_at = path.stat().st_mtime
        except OSError:
            continue
        metadata = item['metadata']
        width, height = _library_dimensions(path, metadata)
        library_item = {
            'path': str(path),
            'url': url,
            'name': path.name,
            'modifiedAt': modified_at,
            'metadata': metadata,
            'operation': _library_operation(metadata),
        }
        if width and height:
            library_item['width'] = width
            library_item['height'] = height
            library_item['size'] = f'{width} × {height}'
            library_item['aspectRatio'] = _library_aspect_ratio(width, height)
        if isinstance(metadata.get('prompt'), str):
            library_item['prompt'] = metadata['prompt']
        items.append(library_item)

    items.sort(key=lambda item: item['modifiedAt'], reverse=True)
    return {'items': items}


def _library_paths(payload: dict[str, Any]) -> list[Path]:
    values = payload.get('paths')
    if not isinstance(values, list) or not values:
        raise ValueError('Select at least one library image.')

    output_root = Path(config.path_outputs).resolve()
    paths: list[Path] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str) or not value.strip():
            raise ValueError('Library image paths must be strings.')
        path = Path(value).resolve()
        try:
            path.relative_to(output_root)
        except ValueError as error:
            raise ValueError('Library images must be inside the output folder.') from error
        if path.suffix.casefold() not in LIBRARY_IMAGE_SUFFIXES:
            raise ValueError('Only generated image files can be managed.')
        if not path.is_file():
            raise ValueError(f'Library image not found: {path.name}.')
        key = str(path)
        if key not in seen:
            seen.add(key)
            paths.append(path)

    if not paths:
        raise ValueError('Select at least one library image.')
    return paths


def _library_archive(paths: list[Path]) -> bytes:
    output_root = Path(config.path_outputs).resolve()
    archive_buffer = io.BytesIO()
    archive_names: set[str] = set()
    with zipfile.ZipFile(archive_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in paths:
            archive_name = path.relative_to(output_root).as_posix()
            if archive_name in archive_names:
                archive_name = f'{path.stem}-{len(archive_names)}{path.suffix}'
            archive_names.add(archive_name)
            archive.write(path, arcname=archive_name)
    return archive_buffer.getvalue()


def _delete_library_images(paths: list[Path]) -> int:
    for path in paths:
        try:
            path.unlink()
        except OSError as error:
            raise OSError(f'Unable to delete {path.name}: {error}') from error
    return len(paths)


def _default_loras() -> list[list[Any]]:
    return [[bool(enabled), filename, float(weight)] for enabled, filename, weight in config.default_loras]


def _decode_batch_images(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    paths: list[str] = []
    temp_root = Path(config.temp_path)
    temp_root.mkdir(parents=True, exist_ok=True)
    for value in values[:config.default_max_image_number]:
        image = _decode_image(value)
        if image is None:
            continue
        path = temp_root / f'react-batch-{uuid4().hex}.png'
        Image.fromarray(image).save(path, format='PNG')
        paths.append(str(path))
    return paths


def _build_task(payload: dict[str, Any]) -> worker.AsyncTask:
    performance_value = payload.get('performance', config.default_performance)
    if performance_value not in Performance.values():
        performance_value = config.default_performance
    performance = Performance(performance_value)

    styles = payload.get('styles', config.default_styles)
    if not isinstance(styles, list):
        styles = list(config.default_styles)
    styles = [style for style in styles if isinstance(style, str) and style in sdxl_styles.legal_style_names]

    ratios = payload.get('aspectRatios', payload.get('aspectRatio', [config.default_aspect_ratio]))
    if not isinstance(ratios, list):
        ratios = [ratios]
    ratios = [_ratio_value(ratio) for ratio in ratios]
    ratios = list(dict.fromkeys(ratios)) or [config.default_aspect_ratio.split('×')[0] + '*' + config.default_aspect_ratio.split('×')[1].split()[0]]

    model_names = list(config.model_filenames)
    lora_names = list(config.lora_filenames)
    vae_names = list(config.vae_filenames)
    base_model = _safe_model(payload.get('baseModel'), model_names, config.default_base_model_name)
    refiner_model = _safe_model(payload.get('refinerModel'), model_names, config.default_refiner_model_name, allow_none=True)
    vae_name = _safe_model(payload.get('vae'), vae_names, config.default_vae, allow_none=True)

    loras_payload = payload.get('loras', _default_loras())
    loras: list[tuple[bool, str, float]] = []
    if isinstance(loras_payload, list):
        for item in loras_payload[:config.default_max_lora_number]:
            if not isinstance(item, (list, tuple)) or len(item) < 3:
                continue
            enabled = bool(item[0])
            name = item[1] if isinstance(item[1], str) and item[1] in lora_names else 'None'
            weight = _safe_float(item[2], 1.0, config.default_loras_min_weight, config.default_loras_max_weight)
            loras.append((enabled, name, weight))
    while len(loras) < config.default_max_lora_number:
        loras.append((True, 'None', 1.0))

    task = worker.AsyncTask(args=[])
    task.prompt = str(payload.get('prompt', config.default_prompt) or '')
    task.negative_prompt = str(payload.get('negativePrompt', config.default_prompt_negative) or '')
    task.style_selections = styles
    task.performance_selection = performance
    task.steps = performance.steps()
    task.original_steps = task.steps
    task.aspect_ratios_selection = ratios
    task.image_number = _safe_int(payload.get('imageNumber'), config.default_image_number, 1, config.default_max_image_number)
    task.output_format = payload.get('outputFormat') if payload.get('outputFormat') in flags.OutputFormat.list() else config.default_output_format
    seed = payload.get('seed')
    if seed in (None, '', 'random'):
        seed = random.randint(0, 2**63 - 1)
    task.seed = _safe_int(seed, random.randint(0, 2**63 - 1), 0, 2**63 - 1)
    task.read_wildcards_in_order = bool(payload.get('readWildcardsInOrder', False))
    task.sharpness = _safe_float(payload.get('sharpness'), float(config.default_sample_sharpness), 0, 30)
    task.cfg_scale = _safe_float(payload.get('guidanceScale'), float(config.default_cfg_scale), 1, 30)
    task.base_model_name = base_model
    task.refiner_model_name = refiner_model
    task.refiner_switch = _safe_float(payload.get('refinerSwitch'), float(config.default_refiner_switch), 0.1, 1)
    task.loras = [(name, weight) for enabled, name, weight in loras if enabled and name != 'None']

    input_enabled = bool(payload.get('inputImageEnabled', False))
    mode = payload.get('currentTab', 'uov')
    task.input_image_checkbox = input_enabled
    task.current_tab = mode if mode in ('uov', 'batch_upscale', 'inpaint', 'ip', 'desc', 'enhance', 'metadata') else 'uov'
    task.uov_method = payload.get('uovMethod') if payload.get('uovMethod') in flags.uov_list else config.default_uov_method
    task.uov_input_image = _decode_image(payload.get('inputImage'))
    task.batch_upscale_input = _decode_batch_images(payload.get('batchImages'))
    task.outpaint_selections = payload.get('outpaintSelections', []) if isinstance(payload.get('outpaintSelections', []), list) else []
    task.inpaint_input_image = _decode_image(payload.get('inpaintImage') or payload.get('inputImage'))
    task.inpaint_additional_prompt = str(payload.get('inpaintPrompt', '') or '')
    task.inpaint_mask_image_upload = _decode_image(payload.get('inpaintMask'))

    task.disable_preview = bool(payload.get('disablePreview', False))
    task.disable_intermediate_results = bool(payload.get('disableIntermediateResults', Performance.has_restricted_features(performance)))
    task.disable_seed_increment = bool(payload.get('disableSeedIncrement', False))
    task.black_out_nsfw = bool(payload.get('blackOutNsfw', config.default_black_out_nsfw))
    task.adm_scaler_positive = _safe_float(payload.get('admScalerPositive'), 1.5, 0.1, 3)
    task.adm_scaler_negative = _safe_float(payload.get('admScalerNegative'), 0.8, 0.1, 3)
    task.adm_scaler_end = _safe_float(payload.get('admScalerEnd'), 0.3, 0, 1)
    task.adaptive_cfg = _safe_float(payload.get('adaptiveCfg'), float(config.default_cfg_tsnr), 1, 30)
    task.clip_skip = _safe_int(payload.get('clipSkip'), config.default_clip_skip, 1, flags.clip_skip_max)
    task.sampler_name = payload.get('sampler') if payload.get('sampler') in flags.sampler_list else config.default_sampler
    task.scheduler_name = payload.get('scheduler') if payload.get('scheduler') in flags.scheduler_list else config.default_scheduler
    task.vae_name = vae_name
    task.overwrite_step = _safe_int(payload.get('overwriteStep'), config.default_overwrite_step)
    task.overwrite_switch = _safe_int(payload.get('overwriteSwitch'), config.default_overwrite_switch)
    task.overwrite_width = _safe_int(payload.get('overwriteWidth'), -1)
    task.overwrite_height = _safe_int(payload.get('overwriteHeight'), -1)
    task.overwrite_vary_strength = _safe_float(payload.get('overwriteVaryStrength'), -1, -1, 1)
    task.overwrite_upscale_strength = _safe_float(payload.get('overwriteUpscaleStrength'), config.default_overwrite_upscale, -1, 1)
    task.mixing_image_prompt_and_vary_upscale = bool(payload.get('mixingImagePromptAndVaryUpscale', False))
    task.mixing_image_prompt_and_inpaint = bool(payload.get('mixingImagePromptAndInpaint', False))
    task.debugging_cn_preprocessor = bool(payload.get('debuggingCnPreprocessor', False))
    task.skipping_cn_preprocessor = bool(payload.get('skippingCnPreprocessor', False))
    task.canny_low_threshold = _safe_int(payload.get('cannyLowThreshold'), 64, 1, 255)
    task.canny_high_threshold = _safe_int(payload.get('cannyHighThreshold'), 128, 1, 255)
    task.refiner_swap_method = payload.get('refinerSwapMethod') if payload.get('refinerSwapMethod') in ('joint', 'separate', 'vae') else flags.refiner_swap_method
    task.controlnet_softness = _safe_float(payload.get('controlnetSoftness'), 0.25, 0, 1)
    task.freeu_enabled = bool(payload.get('freeuEnabled', False))
    task.freeu_b1 = _safe_float(payload.get('freeuB1'), 1.01)
    task.freeu_b2 = _safe_float(payload.get('freeuB2'), 1.02)
    task.freeu_s1 = _safe_float(payload.get('freeuS1'), 0.99)
    task.freeu_s2 = _safe_float(payload.get('freeuS2'), 0.95)
    task.debugging_inpaint_preprocessor = bool(payload.get('debuggingInpaintPreprocessor', False))
    task.inpaint_disable_initial_latent = bool(payload.get('inpaintDisableInitialLatent', False))
    task.inpaint_engine = payload.get('inpaintEngine') if payload.get('inpaintEngine') in flags.inpaint_engine_versions else config.default_inpaint_engine_version
    task.inpaint_strength = _safe_float(payload.get('inpaintStrength'), 1, 0, 1)
    task.inpaint_respective_field = _safe_float(payload.get('inpaintRespectiveField'), 0.618, 0, 1)
    task.inpaint_advanced_masking_checkbox = bool(payload.get('inpaintAdvancedMasking', config.default_inpaint_advanced_masking_checkbox))
    task.invert_mask_checkbox = bool(payload.get('invertMask', config.default_invert_mask_checkbox))
    task.inpaint_erode_or_dilate = _safe_int(payload.get('inpaintErodeOrDilate'), 0, -64, 64)
    task.save_final_enhanced_image_only = bool(payload.get('saveFinalEnhancedImageOnly', config.default_save_only_final_enhanced_image))
    task.save_metadata_to_images = bool(payload.get('saveMetadata', config.default_save_metadata_to_images))
    metadata_scheme = payload.get('metadataScheme', config.default_metadata_scheme)
    task.metadata_scheme = MetadataScheme(metadata_scheme) if metadata_scheme in (item[1] for item in flags.metadata_scheme) else MetadataScheme.FOOOCUS

    task.cn_tasks = {name: [] for name in flags.ip_list}
    image_prompts = payload.get('imagePrompts', [])
    if isinstance(image_prompts, list):
        for image_prompt in image_prompts[:config.default_controlnet_image_count]:
            if not isinstance(image_prompt, dict):
                continue
            image = _decode_image(image_prompt.get('image'))
            image_type = image_prompt.get('type') if image_prompt.get('type') in flags.ip_list else flags.default_ip
            if image is not None:
                task.cn_tasks[image_type].append([
                    image,
                    _safe_float(image_prompt.get('stopAt'), flags.default_parameters[image_type][0], 0, 1),
                    _safe_float(image_prompt.get('weight'), flags.default_parameters[image_type][1], 0, 2)
                ])
    if task.current_tab == 'ip' and not any(task.cn_tasks.values()):
        image = _decode_image(payload.get('imagePromptImage', payload.get('inputImage')))
        if image is not None:
            image_type = flags.default_ip
            task.cn_tasks[image_type].append([
                image,
                flags.default_parameters[image_type][0],
                flags.default_parameters[image_type][1]
            ])

    task.debugging_dino = bool(payload.get('debuggingDino', False))
    task.dino_erode_or_dilate = _safe_int(payload.get('dinoErodeOrDilate'), 0, -64, 64)
    task.debugging_enhance_masks_checkbox = bool(payload.get('debuggingEnhanceMasks', False))
    task.enhance_input_image = _decode_image(payload.get('enhanceImage') or payload.get('inputImage'))
    task.enhance_checkbox = bool(payload.get('enhance', False))
    task.enhance_uov_method = payload.get('enhanceUovMethod') if payload.get('enhanceUovMethod') in flags.uov_list else config.default_enhance_uov_method
    task.enhance_uov_processing_order = payload.get('enhanceUovOrder') if payload.get('enhanceUovOrder') in flags.enhancement_uov_processing_order else config.default_enhance_uov_processing_order
    task.enhance_uov_prompt_type = payload.get('enhanceUovPromptType') if payload.get('enhanceUovPromptType') in flags.enhancement_uov_prompt_types else config.default_enhance_uov_prompt_type
    task.enhance_ctrls = []
    task.should_enhance = task.enhance_checkbox and (
        task.enhance_uov_method != flags.disabled.casefold() or len(task.enhance_ctrls) > 0
    )
    task.images_to_enhance_count = 0
    task.enhance_stats = {}
    task.generate_image_grid = bool(payload.get('generateImageGrid', False))
    return task


def _config_payload() -> dict[str, Any]:
    return {
        'version': fooocus_version.version,
        'defaultPrompt': config.default_prompt,
        'defaultNegativePrompt': config.default_prompt_negative,
        'defaultPerformance': config.default_performance,
        'defaultAspectRatio': _ratio_value(config.default_aspect_ratio),
        'defaultImageNumber': config.default_image_number,
        'defaultOutputFormat': config.default_output_format,
        'defaultGuidanceScale': config.default_cfg_scale,
        'defaultSharpness': config.default_sample_sharpness,
        'defaultBaseModel': config.default_base_model_name,
        'defaultRefinerModel': config.default_refiner_model_name,
        'defaultRefinerSwitch': config.default_refiner_switch,
        'defaultStyles': list(config.default_styles),
        'defaultLoras': _default_loras(),
        'maxImageNumber': config.default_max_image_number,
        'maxLoraNumber': config.default_max_lora_number,
        'presets': list(config.available_presets),
        'styles': list(sdxl_styles.legal_style_names),
        'aspectRatios': [
            {'value': ratio, 'label': _strip_markup(config.add_ratio(ratio))}
            for ratio in config.available_aspect_ratios
        ],
        'models': list(config.model_filenames),
        'loras': list(config.lora_filenames),
        'vaes': list(config.vae_filenames),
        'performances': Performance.values(),
        'outputFormats': flags.OutputFormat.list(),
        'samplers': list(flags.sampler_list),
        'schedulers': list(flags.scheduler_list),
        'uovMethods': list(flags.uov_list),
        'imagePromptTypes': list(flags.ip_list),
        'inpaintEngines': list(flags.inpaint_engine_versions),
        'inpaintMethods': list(flags.inpaint_options),
        'describeTypes': list(flags.describe_types),
        'featureFlags': {
            'imageLog': not args_manager.args.disable_image_log,
            'metadata': not args_manager.args.disable_metadata,
            'presetSelection': not args_manager.args.disable_preset_selection,
        },
    }


def queue_payload() -> dict[str, Any]:
    queue_items = worker.get_queue_items()
    progress = worker.get_queue_progress()
    progress_payload = None
    if progress['active'] and progress['progress'] is not None:
        number, text, image = progress['progress']
        progress_payload = {
            'percent': number,
            'text': text,
            'preview': _serialize_result(image),
        }
    gallery = [
        result
        for result in (_serialize_result(item) for item in worker.get_queue_results())
        if result is not None
    ]
    return {
        'busy': worker.is_busy(),
        'items': queue_items,
        'progress': progress_payload,
        'gallery': list(dict.fromkeys(gallery)),
    }


def _find_task(task_id: int) -> worker.AsyncTask | None:
    with worker._queue_lock:
        for task in worker._queue_items:
            if task.queue_id == task_id:
                return task
    return None


def _control_task(task_id: int, action: str) -> bool:
    task = _find_task(task_id)
    if task is None:
        return False
    task.last_stop = action
    if task.processing:
        import ldm_patched.modules.model_management as model_management
        model_management.interrupt_current_processing()
    return True


def _api_response(path: str, method: str, payload: dict[str, Any] | None) -> tuple[int, dict[str, Any]]:
    if method == 'GET' and path == '/api/config':
        return HTTPStatus.OK, _config_payload()
    if method == 'GET' and path == '/api/queue':
        return HTTPStatus.OK, queue_payload()
    if method == 'GET' and path == '/api/library':
        return HTTPStatus.OK, library_payload()
    if method == 'GET' and path == '/api/health':
        return HTTPStatus.OK, {'status': 'ok', 'version': fooocus_version.version}
    if method == 'GET' and path == '/api/system':
        return HTTPStatus.OK, system_payload()
    if method == 'POST' and path == '/api/generate':
        task = _build_task(payload or {})
        worker.enqueue_task(task, stream_to_ui=False)
        return HTTPStatus.ACCEPTED, {'taskId': task.queue_id}
    if method == 'POST' and path == '/api/library/delete':
        paths = _library_paths(payload or {})
        return HTTPStatus.OK, {'deleted': _delete_library_images(paths)}
    if method == 'POST' and path.startswith('/api/tasks/') and path.endswith('/stop'):
        task_id = int(path.split('/')[3])
        return (HTTPStatus.OK, {'ok': True}) if _control_task(task_id, 'stop') else (HTTPStatus.NOT_FOUND, {'error': 'Task not found.'})
    if method == 'POST' and path.startswith('/api/tasks/') and path.endswith('/skip'):
        task_id = int(path.split('/')[3])
        return (HTTPStatus.OK, {'ok': True}) if _control_task(task_id, 'skip') else (HTTPStatus.NOT_FOUND, {'error': 'Task not found.'})
    if method == 'POST' and path == '/api/refresh':
        config.update_files()
        return HTTPStatus.OK, _config_payload()
    if method == 'POST' and path == '/api/describe':
        data = payload or {}
        image = _decode_image(data.get('image'))
        if image is None:
            raise ValueError('An image is required.')
        modes = data.get('modes', flags.describe_types)
        if isinstance(modes, str):
            modes = [modes]
        if not isinstance(modes, list):
            raise ValueError('Describe modes must be a list.')
        prompts: list[str] = []
        styles: set[str] = set()
        if flags.describe_type_photo in modes:
            from extras.interrogate import default_interrogator as photo_interrogator
            prompts.append(photo_interrogator(image))
            styles.update(['Fooocus V2', 'Fooocus Enhance', 'Fooocus Sharp'])
        if flags.describe_type_anime in modes:
            from extras.wd14tagger import default_interrogator as anime_interrogator
            prompts.append(anime_interrogator(image))
            styles.update(['Fooocus V2', 'Fooocus Masterpiece'])
        return HTTPStatus.OK, {
            'prompt': ', '.join(prompt for prompt in prompts if prompt),
            'styles': sorted(styles) if data.get('applyStyles', True) else [],
        }
    if method == 'POST' and path == '/api/metadata':
        from modules.meta_parser import get_metadata_parser, read_info_from_image
        image = _decode_image(payload.get('image') if payload else None)
        if image is None:
            raise ValueError('An image is required.')
        parameters, metadata_scheme = read_info_from_image(Image.fromarray(image))
        if parameters is None:
            return HTTPStatus.OK, {'metadata': {}, 'parameters': None}
        if metadata_scheme is not None:
            parameters = get_metadata_parser(metadata_scheme).to_json(parameters)
        return HTTPStatus.OK, {'metadata': parameters, 'parameters': parameters}
    return HTTPStatus.NOT_FOUND, {'error': 'Route not found.'}


class _RequestHandler(BaseHTTPRequestHandler):
    server_version = 'FooocusReact/1.0'

    def _authorized(self) -> bool:
        from modules.auth import auth_enabled, check_auth
        if not auth_enabled:
            return True
        header = self.headers.get('Authorization', '')
        if not header.startswith('Basic '):
            return False
        try:
            user, password = base64.b64decode(header[6:]).decode('utf-8').split(':', 1)
        except (ValueError, UnicodeDecodeError, binascii.Error):
            return False
        return check_auth(user, password)

    def _send_json(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status: int, message: str) -> None:
        self._send_json(status, {'error': message})

    def _send_zip(self, content: bytes) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Disposition', 'attachment; filename="fooocus-library.zip"')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(content)

    def _serve_media(self, query: dict[str, list[str]]) -> None:
        requested = query.get('path', [''])[0]
        path = Path(requested)
        if not path.is_file() or not _is_allowed_media(path):
            self._send_error_json(HTTPStatus.NOT_FOUND, 'Media not found.')
            return
        content = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type', mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        self.end_headers()
        self.wfile.write(content)

    def _serve_static(self, request_path: str) -> None:
        relative = urllib.parse.unquote(request_path.lstrip('/'))
        candidate = (STATIC_ROOT / relative).resolve()
        if candidate.is_file() and STATIC_ROOT.resolve() in candidate.parents:
            path = candidate
        else:
            path = STATIC_ROOT / 'index.html'
        if not path.is_file():
            self._send_error_json(HTTPStatus.SERVICE_UNAVAILABLE, 'The React frontend has not been built.')
            return
        content = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type', mimetypes.guess_type(path.name)[0] or 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        if not self._authorized():
            self.send_response(HTTPStatus.UNAUTHORIZED)
            self.send_header('WWW-Authenticate', 'Basic realm="Fooocus"')
            self.end_headers()
            return
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == '/api/media':
            self._serve_media(urllib.parse.parse_qs(parsed.query))
            return
        if parsed.path.startswith('/api/'):
            try:
                status, response = _api_response(parsed.path, 'GET', None)
                self._send_json(status, response)
            except (ValueError, TypeError) as error:
                self._send_error_json(HTTPStatus.BAD_REQUEST, str(error))
            return
        self._serve_static(parsed.path)

    def do_POST(self) -> None:
        if not self._authorized():
            self.send_response(HTTPStatus.UNAUTHORIZED)
            self.send_header('WWW-Authenticate', 'Basic realm="Fooocus"')
            self.end_headers()
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self._send_error_json(HTTPStatus.BAD_REQUEST, 'Invalid Content-Length.')
            return
        if length > MAX_REQUEST_BYTES:
            self._send_error_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, 'Request is too large.')
            return
        try:
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body.decode('utf-8')) if raw_body else {}
            if not isinstance(payload, dict):
                raise ValueError('Request body must be a JSON object.')
            request_path = urllib.parse.urlsplit(self.path).path
            if request_path == '/api/library/download':
                self._send_zip(_library_archive(_library_paths(payload)))
                return
            status, response = _api_response(request_path, 'POST', payload)
            self._send_json(status, response)
        except json.JSONDecodeError as error:
            self._send_error_json(HTTPStatus.BAD_REQUEST, f'Invalid JSON: {error.msg}.')
        except ValueError as error:
            self._send_error_json(HTTPStatus.BAD_REQUEST, str(error))
        except (TypeError, KeyError) as error:
            self._send_error_json(HTTPStatus.BAD_REQUEST, f'Invalid request: {error}.')
        except (OSError, RuntimeError) as error:
            self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(error))

    def log_message(self, format: str, *args: Any) -> None:
        if not getattr(args_manager.args, 'disable_server_log', False):
            super().log_message(format, *args)


class ReactServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def run_server() -> None:
    config.update_files()
    host = args_manager.args.listen
    port = args_manager.args.port or int(os.environ.get('FOOOCUS_SERVER_PORT', '7865'))
    server = ReactServer((host, port), _RequestHandler)
    print(f'Fooocus React UI ready at http://{host}:{port}')
    if args_manager.args.in_browser:
        webbrowser.open(f'http://127.0.0.1:{port}')
    try:
        server.serve_forever()
    finally:
        server.server_close()
