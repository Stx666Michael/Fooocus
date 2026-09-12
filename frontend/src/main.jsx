import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const EMPTY_FORM = {
  prompt: '',
  negativePrompt: '',
  performance: 'Speed',
  aspectRatios: ['1152*896'],
  imageNumber: 2,
  outputFormat: 'png',
  guidanceScale: 7,
  sharpness: 2,
  seed: 'random',
  baseModel: '',
  refinerModel: 'None',
  refinerSwitch: 0.8,
  sampler: 'dpmpp_2m_sde_gpu',
  scheduler: 'karras',
  vae: 'Default (model)',
  styles: [],
  loras: [],
  inputImage: null,
  batchImages: [],
  inpaintMask: null,
  inpaintPrompt: '',
  imagePromptWeight: 1,
  imagePromptStopAt: 0.5,
  inputImageEnabled: false,
  uovMethod: 'Disabled',
  enhance: false,
};

const navItems = [
  { id: 'create', label: 'Create', icon: 'sparkles' },
  { id: 'queue', label: 'Queue', icon: 'layers' },
  { id: 'library', label: 'Library', icon: 'image' },
  { id: 'styles', label: 'Styles', icon: 'grid' },
  { id: 'models', label: 'Models', icon: 'sliders' },
];

const modeItems = [
  { id: 'text', label: 'Text to image', icon: 'sparkles' },
  { id: 'image', label: 'Upscale / vary', icon: 'image' },
  { id: 'batch', label: 'Batch upscale', icon: 'layers' },
  { id: 'inpaint', label: 'Inpaint / outpaint', icon: 'edit' },
  { id: 'ip', label: 'Image prompt', icon: 'image' },
  { id: 'describe', label: 'Describe', icon: 'search' },
  { id: 'enhance', label: 'Enhance', icon: 'wand' },
  { id: 'metadata', label: 'Metadata', icon: 'info' },
];

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const paths = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>,
    edit: <><path d="m4 16-.8 4.8L8 20l11.5-11.5a2.1 2.1 0 0 0-3-3L5 17Z" /><path d="m14.5 7.5 3 3" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-5 3.5 3 2.5-2 5 4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
    moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5a8.5 8.5 0 1 0 12 12Z" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.6-4L3 10" /><path d="M3 5v5h5" /><path d="M4 13a8 8 0 0 0 14.6 4L21 14" /><path d="M21 19v-5h-5" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    settings: <><path d="M12 3v2" /><path d="M12 19v2" /><path d="m4.2 5.2 1.4 1.4" /><path d="m18.4 18.4 1.4 1.4" /><path d="M3 12h2" /><path d="M19 12h2" /><path d="m5.6 18.4 1.4-1.4" /><path d="m17 7 1.4-1.4" /><circle cx="12" cy="12" r="4" /></>,
    sliders: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="11" cy="18" r="2" /></>,
    sparkle: <><path d="m12 3-1.2 5.8L5 10l5.8 1.2L12 17l1.2-5.8L19 10l-5.8-1.2L12 3Z" /><path d="m19 16-.5 2.5L16 19l2.5.5L19 22l.5-2.5L22 19l-2.5-.5L19 16Z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.9 19.1 1.4-1.4" /><path d="m17.7 6.3 1.4-1.4" /></>,
    trash: <><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="m6 7 1 14h10l1-14" /><path d="M9 7V4h6v3" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></>,
    wand: <><path d="m15 4 5 5" /><path d="m13 6 5 5L8 21H3v-5L13 6Z" /><path d="m3 3 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" /></>,
    x: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  };
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    >
      {paths[name] || paths.sparkle}
    </svg>
  );
}

function apiError(response, fallback) {
  if (!response.ok) {
    return response.json().then((body) => {
      throw new Error(body.error || fallback);
    });
  }
  return response;
}

function readableRatio(value) {
  const [width, height] = String(value).split('*');
  return width && height ? `${width} × ${height}` : value;
}

function itemTimestamp(item) {
  const value = Number(item?.modifiedAt);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 100000000000 ? value : value * 1000;
}

function mediaPathFromUrl(value) {
  if (!value) return '';
  try {
    return new URL(value, window.location.origin).searchParams.get('path') || '';
  } catch {
    return '';
  }
}

function libraryItemPath(item) {
  return item?.path || mediaPathFromUrl(item?.url);
}

function libraryItemKey(item) {
  return libraryItemPath(item) || item?.url || item?.name || '';
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
  const timestamp = value instanceof Date ? value : new Date(itemTimestamp({ modifiedAt: value }));
  if (Number.isNaN(timestamp.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, options).format(timestamp);
}

function formatDateTime(value) {
  return formatDate(value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function metadataText(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatPercent(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : `${Math.round(Number(value))}%`;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function itemAspectRatio(item) {
  if (item?.aspectRatio) return item.aspectRatio;
  if (item?.width && item?.height) {
    const divisor = Math.abs(greatestCommonDivisor(item.width, item.height));
    return `${item.width / divisor}:${item.height / divisor}`;
  }
  return '—';
}

function greatestCommonDivisor(first, second) {
  let a = Math.abs(Number(first));
  let b = Math.abs(Number(second));
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function useConfig() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback((path = '/api/config', options) => {
    setError('');
    return fetch(path, options)
      .then((response) => apiError(response, 'Unable to load Fooocus settings.'))
      .then((response) => response.json())
      .then((data) => {
        setConfig(data);
        return data;
      })
      .catch((reason) => {
        setError(reason.message);
        throw reason;
      });
  }, []);
  const refresh = useCallback(() => load('/api/refresh', { method: 'POST' }), [load]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  return { config, error, reload: load, refresh };
}

function useSystemStatus() {
  const [system, setSystem] = useState(null);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      fetch('/api/system')
        .then((response) => apiError(response, 'Unable to read system status.'))
        .then((response) => response.json())
        .then((data) => {
          if (mounted) setSystem(data);
        })
        .catch(() => {});
    };
    load();
    const interval = window.setInterval(load, 2500);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);
  return system;
}

function SelectField({ label, value, options = [], onChange, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="select-wrap">
        <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => {
            const item = typeof option === 'string' ? { value: option, label: option } : option;
            return <option key={item.value} value={item.value}>{item.label}</option>;
          })}
        </select>
        <Icon name="chevron" size={15} />
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function RangeField({ label, value, min, max, step, onChange, format = (item) => item }) {
  return (
    <label className="range-field">
      <span className="field-label">
        {label}
        <strong>{format(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="range-scale"><span>{min}</span><span>{max}</span></span>
    </label>
  );
}

function Pill({ children, tone = 'neutral' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function EmptyState({ icon = 'image', title, body, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} size={24} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function ImageDropzone({ image, onChange, onClear, label, hint }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const readFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={`image-dropzone ${dragging ? 'is-dragging' : ''} ${image ? 'has-image' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files[0]); }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          readFile(event.target.files[0]);
          event.target.value = '';
        }}
      />
      {image ? (
        <>
          <img src={image} alt="Input reference" />
          <button
            className="image-remove"
            type="button"
            aria-label="Remove input image"
            onClick={(event) => { event.stopPropagation(); onClear(); }}
          >
            <Icon name="x" size={15} />
          </button>
          <div className="image-overlay"><Icon name="edit" size={16} /> Replace image</div>
        </>
      ) : (
        <div className="dropzone-copy">
          <div className="dropzone-icon"><Icon name="upload" size={18} /></div>
          <strong>{label || 'Drop an image here'}</strong>
          <span>{hint || 'or browse from your device'}</span>
        </div>
      )}
    </div>
  );
}

function MultiImageDropzone({ images, onChange, label, hint }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const readFiles = (files) => {
    const selected = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!selected.length) return;
    Promise.all(selected.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    }))).then((values) => onChange(values));
  };

  return (
    <div
      className={`image-dropzone ${dragging ? 'is-dragging' : ''} ${images.length ? 'has-image' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); readFiles(event.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter') inputRef.current?.click(); }}
    >
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => readFiles(event.target.files)} />
      {images.length ? (
        <div className="multi-image-preview">
          {images.slice(0, 6).map((image, index) => <img key={`${image}-${index}`} src={image} alt={`Batch input ${index + 1}`} />)}
          <strong>{images.length} image{images.length === 1 ? '' : 's'} selected</strong>
          <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); onChange([]); }}>Clear</button>
        </div>
      ) : (
        <div className="dropzone-copy">
          <div className="dropzone-icon"><Icon name="upload" size={18} /></div>
          <strong>{label || 'Drop images here'}</strong>
          <span>{hint || 'or browse from your device'}</span>
        </div>
      )}
    </div>
  );
}

function PreviewStage({ progress, gallery, previewImage, onSelectImage, onClearSelection }) {
  const preview = previewImage || progress?.preview || gallery[gallery.length - 1];
  return (
    <div className={`preview-stage ${preview ? 'has-preview' : ''}`}>
      {preview ? (
        <img className="preview-image" src={preview} alt="Generated result" />
      ) : (
        <div className="preview-placeholder">
          <div className="placeholder-orbit"><span /><span /><span /></div>
          <span className="placeholder-kicker">Your canvas is ready</span>
          <h2>Make something<br /><em>unexpected.</em></h2>
          <p>Describe an idea and let Fooocus handle the details.</p>
        </div>
      )}
      {progress && (
        <div className="preview-progress">
          <div className="progress-meta">
            <span>{progress.text || 'Preparing your image'}</span>
            <strong>{Math.round(progress.percent || 0)}%</strong>
          </div>
          <div className="progress-track"><span style={{ width: `${Math.max(3, progress.percent || 0)}%` }} /></div>
        </div>
      )}
      {previewImage && (
        <button type="button" className="clear-preview" onClick={onClearSelection}>
          <Icon name="close" size={15} /> Clear preview
        </button>
      )}
      {gallery.length > 0 && (
        <div className="preview-thumbs">
          {gallery.slice(-6).map((image, index) => (
            <button
              type="button"
              className={image === preview ? 'selected' : ''}
              key={`${image}-${index}`}
              onClick={() => onSelectImage(image)}
            >
              <img src={image} alt={`Result ${index + 1}`} />
            </button>
          ))}
          <span className="thumb-count">{gallery.length} {gallery.length === 1 ? 'result' : 'results'}</span>
        </div>
      )}
    </div>
  );
}

function PromptCard({
  form,
  setForm,
  mode,
  setMode,
  config,
  onGenerate,
  onDescribe,
  onMetadata,
  onStop,
  taskActive,
  taskId,
  error,
  metadataResult,
}) {
  const [showNegative, setShowNegative] = useState(Boolean(form.negativePrompt));
  const [showInput, setShowInput] = useState(mode !== 'text' || Boolean(form.inputImage));
  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setPrompt = (event) => setValue('prompt', event.target.value);
  const modes = modeItems;

  useEffect(() => {
    setShowInput(mode !== 'text' || Boolean(form.inputImage));
    setValue('inputImageEnabled', !['text', 'describe', 'metadata'].includes(mode));
    setValue('enhance', mode === 'enhance');
    setValue('uovMethod', mode === 'enhance' ? 'Upscale (2x)' : form.uovMethod);
    if (mode === 'batch') {
      const batchMethods = (config?.uovMethods || []).filter((method) => method.toLowerCase().includes('upscale'));
      if (batchMethods.length && !batchMethods.includes(form.uovMethod)) {
        setValue('uovMethod', batchMethods.find((method) => method.toLowerCase().includes('fast')) || batchMethods[0]);
      }
    }
  }, [config, mode]);

  return (
    <section className="panel prompt-card">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PROMPT</span>
          <h2>What will you create?</h2>
        </div>
        <Pill tone="green"><span className="status-dot" /> Local</Pill>
      </div>
      <div className="prompt-input-wrap">
        <textarea
          aria-label="Prompt"
          value={form.prompt}
          onChange={setPrompt}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onGenerate();
          }}
          placeholder="A cinematic scene, a quiet moment, something entirely yours..."
          rows={4}
        />
        <div className="prompt-footer">
          <span>{form.prompt.length} characters</span>
          <span className="shortcut"><kbd>⌘</kbd><kbd>↵</kbd> {taskActive ? 'to add to queue' : 'to generate'}</span>
        </div>
      </div>
      <div className="mode-tabs" role="tablist" aria-label="Generation mode">
        {modes.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            className={mode === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => setMode(item.id)}
          >
            <Icon name={item.icon} size={15} /> {item.label}
          </button>
        ))}
      </div>
      {mode !== 'text' && showInput && (
        <div className="input-section">
          {mode === 'batch' ? (
            <>
              <div className="section-label"><span>Images to upscale</span><Pill>{form.batchImages.length} selected</Pill></div>
              <MultiImageDropzone
                images={form.batchImages}
                onChange={(value) => setValue('batchImages', value)}
                label="Drop multiple images"
                hint="PNG, JPG or WEBP · one selected mode per batch"
              />
              <SelectField
                label="Upscale mode"
                value={form.uovMethod}
                options={(config?.uovMethods || []).filter((method) => method.toLowerCase().includes('upscale'))}
                onChange={(value) => setValue('uovMethod', value)}
                hint="Regular modes apply diffusion settings; Fast 2x skips diffusion."
              />
            </>
          ) : (
            <>
              <div className="section-label">
                <span>{mode === 'enhance' ? 'Source image' : mode === 'metadata' ? 'Fooocus image' : 'Reference image'}</span>
                {form.inputImage && <Pill>{mode === 'enhance' ? 'Enhance mode' : form.uovMethod}</Pill>}
              </div>
              <ImageDropzone
                image={form.inputImage}
                onChange={(value) => setValue('inputImage', value)}
                onClear={() => setValue('inputImage', null)}
                label={mode === 'enhance' ? 'Drop an image to enhance' : mode === 'describe' ? 'Drop an image to describe' : mode === 'metadata' ? 'Drop a generated image' : 'Drop a reference image'}
                hint="PNG, JPG or WEBP · up to 100 MB"
              />
            </>
          )}
          {mode === 'image' && (
            <SelectField
              label="Image operation"
              value={form.uovMethod}
              options={config?.uovMethods || []}
              onChange={(value) => setValue('uovMethod', value)}
            />
          )}
          {mode === 'inpaint' && (
            <>
              <ImageDropzone
                image={form.inpaintMask}
                onChange={(value) => setValue('inpaintMask', value)}
                onClear={() => setValue('inpaintMask', null)}
                label="Optional mask image"
                hint="White areas are edited; leave empty for outpaint"
              />
              <label className="field">
                <span className="field-label">Inpaint prompt</span>
                <input value={form.inpaintPrompt} onChange={(event) => setValue('inpaintPrompt', event.target.value)} placeholder="Describe what should change..." />
              </label>
              <SelectField label="Method" value={form.inpaintMethod || config?.inpaintMethods?.[0] || ''} options={config?.inpaintMethods || []} onChange={(value) => setValue('inpaintMethod', value)} />
            </>
          )}
          {mode === 'ip' && (
            <div className="settings-two-col">
              <RangeField label="Image prompt weight" value={form.imagePromptWeight} min={0} max={2} step={0.05} format={(value) => Number(value).toFixed(2)} onChange={(value) => setValue('imagePromptWeight', value)} />
              <RangeField label="Stop at" value={form.imagePromptStopAt} min={0} max={1} step={0.05} format={(value) => Number(value).toFixed(2)} onChange={(value) => setValue('imagePromptStopAt', value)} />
            </div>
          )}
        </div>
      )}
      <button type="button" className="negative-toggle" onClick={() => setShowNegative((value) => !value)}>
        <span><Icon name="sliders" size={15} /> Negative prompt</span>
        <Icon name="chevron" size={15} />
      </button>
      {showNegative && (
        <textarea
          className="negative-input"
          aria-label="Negative prompt"
          value={form.negativePrompt}
          onChange={(event) => setValue('negativePrompt', event.target.value)}
          placeholder="Things you don't want to see..."
          rows={2}
        />
      )}
      {error && <div className="inline-error"><Icon name="info" size={16} /> {error}</div>}
      {mode === 'describe' ? (
        <button type="button" className="generate-button" onClick={onDescribe} disabled={!form.inputImage}>
          <Icon name="search" size={18} /> Describe image <span className="button-arrow"><Icon name="arrow" size={16} /></span>
        </button>
      ) : mode === 'metadata' ? (
        <>
          <button type="button" className="generate-button" onClick={onMetadata} disabled={!form.inputImage}>
            <Icon name="info" size={18} /> Read metadata <span className="button-arrow"><Icon name="arrow" size={16} /></span>
          </button>
          {metadataResult && <pre className="metadata-result">{JSON.stringify(metadataResult, null, 2)}</pre>}
        </>
      ) : (
        <button
          type="button"
          className={`generate-button ${taskActive ? 'is-queued' : ''}`}
          onClick={onGenerate}
          disabled={(!form.prompt.trim() && mode === 'text') || (mode === 'batch' && !form.batchImages.length) || (mode !== 'text' && mode !== 'batch' && !form.inputImage)}
        >
          {taskActive ? <><Icon name="layers" size={18} /> Add to queue <small>#{taskId}</small><span className="button-arrow"><Icon name="arrow" size={16} /></span></> : <><Icon name="sparkle" size={18} /> Generate image <span className="button-arrow"><Icon name="arrow" size={16} /></span></>}
        </button>
      )}
      {taskActive && (
        <button type="button" className="stop-generation-button" onClick={onStop}>
          <Icon name="pause" size={15} /> Stop latest task <small>#{taskId}</small>
        </button>
      )}
    </section>
  );
}

function GenerationSettings({ form, setForm, config }) {
  const [open, setOpen] = useState(true);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleRatio = (value) => {
    setForm((current) => {
      const ratios = current.aspectRatios.includes(value)
        ? current.aspectRatios.filter((item) => item !== value)
        : [...current.aspectRatios, value];
      return { ...current, aspectRatios: ratios.length ? ratios : [value] };
    });
  };
  const performances = config?.performances || [];
  const ratios = config?.aspectRatios || [];
  return (
    <section className={`panel settings-card ${open ? 'is-open' : ''}`}>
      <button type="button" className="settings-heading" onClick={() => setOpen((value) => !value)}>
        <span><Icon name="settings" size={17} /> Generation settings</span>
        <span className="settings-heading-right"><Pill>{form.performance}</Pill><Icon name="chevron" size={16} /></span>
      </button>
      {open && (
        <div className="settings-body">
          <div className="setting-block">
            <div className="section-label"><span>Performance</span><span className="muted">Choose your balance</span></div>
            <div className="performance-grid">
              {performances.map((performance) => (
                <button
                  type="button"
                  key={performance}
                  className={form.performance === performance ? 'selected' : ''}
                  onClick={() => update('performance', performance)}
                >
                  <span className="performance-mark" />
                  <span>{performance}</span>
                  {form.performance === performance && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-block">
            <div className="section-label"><span>Aspect ratio</span><span className="muted">Select one or more</span></div>
            <div className="ratio-grid">
              {ratios.map((ratio) => (
                <button type="button" key={ratio.value} className={form.aspectRatios.includes(ratio.value) ? 'selected' : ''} onClick={() => toggleRatio(ratio.value)}>
                  <span className={`ratio-preview ratio-${ratio.value.replace('*', '-')}`} />
                  <span>{readableRatio(ratio.value)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-two-col">
            <RangeField label="Images per ratio" value={form.imageNumber} min={1} max={config?.maxImageNumber || 8} step={1} onChange={(value) => update('imageNumber', value)} />
            <label className="field">
              <span className="field-label">Output format</span>
              <span className="segmented">
                {(config?.outputFormats || ['png', 'jpeg', 'webp']).map((format) => (
                  <button type="button" className={form.outputFormat === format ? 'selected' : ''} key={format} onClick={() => update('outputFormat', format)}>{format.toUpperCase()}</button>
                ))}
              </span>
            </label>
          </div>
          <div className="setting-block fine-tune-block">
            <div className="section-label"><span>Fine tune</span><span className="muted">Optional adjustments</span></div>
            <div className="settings-two-col">
              <RangeField label="Guidance" value={form.guidanceScale} min={1} max={30} step={0.1} format={(value) => Number(value).toFixed(1)} onChange={(value) => update('guidanceScale', value)} />
              <RangeField label="Sharpness" value={form.sharpness} min={0} max={30} step={0.1} format={(value) => Number(value).toFixed(1)} onChange={(value) => update('sharpness', value)} />
            </div>
          </div>
          <div className="settings-two-col">
            <SelectField label="Sampler" value={form.sampler} options={config?.samplers || []} onChange={(value) => update('sampler', value)} />
            <SelectField label="Scheduler" value={form.scheduler} options={config?.schedulers || []} onChange={(value) => update('scheduler', value)} />
          </div>
          <div className="seed-row">
            <div className="seed-label"><span className="field-label">Seed</span><span className="muted">Reproducible results</span></div>
            <div className="seed-input">
              <input aria-label="Seed" value={form.seed} onChange={(event) => update('seed', event.target.value)} placeholder="random" />
              <button type="button" onClick={() => update('seed', 'random')} aria-label="Use random seed"><Icon name="refresh" size={15} /></button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ModelSettings({ form, setForm, config }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <section className="panel model-card">
      <div className="panel-heading compact">
        <div><span className="eyebrow">ENGINE</span><h2>Models & styles</h2></div>
        <Pill tone="green">SDXL</Pill>
      </div>
      <div className="settings-two-col">
        <SelectField label="Base model" value={form.baseModel} options={config?.models || []} onChange={(value) => update('baseModel', value)} />
        <SelectField label="Refiner" value={form.refinerModel} options={['None', ...(config?.models || [])]} onChange={(value) => update('refinerModel', value)} />
      </div>
      <div className="settings-two-col model-tuning">
        <SelectField label="VAE" value={form.vae} options={['Default (model)', ...(config?.vaes || [])]} onChange={(value) => update('vae', value)} />
        <RangeField label="Refiner switch" value={form.refinerSwitch} min={0.1} max={1} step={0.01} format={(value) => Number(value).toFixed(2)} onChange={(value) => update('refinerSwitch', value)} />
      </div>
      {!!config?.maxLoraNumber && (
        <div className="lora-settings">
          <div className="section-label"><span>LoRA adapters</span><span className="muted">Optional model guidance</span></div>
          {Array.from({ length: config.maxLoraNumber }, (_, index) => {
            const current = form.loras[index] || [true, 'None', 1];
            const updateLora = (position, value) => {
              const next = Array.from({ length: config.maxLoraNumber }, (_, item) => form.loras[item] || [true, 'None', 1]);
              next[index] = [...current];
              next[index][position] = value;
              update('loras', next);
            };
            return (
              <div className="lora-row" key={index}>
                <input type="checkbox" checked={Boolean(current[0])} onChange={(event) => updateLora(0, event.target.checked)} aria-label={`Enable LoRA ${index + 1}`} />
                <SelectField label={`LoRA ${index + 1}`} value={current[1]} options={['None', ...(config.loras || [])]} onChange={(value) => updateLora(1, value)} />
                <RangeField label="Weight" value={Number(current[2])} min={-2} max={2} step={0.05} format={(value) => Number(value).toFixed(2)} onChange={(value) => updateLora(2, value)} />
              </div>
            );
          })}
        </div>
      )}
      <div className="styles-summary">
        <div className="section-label"><span>Active styles</span><span className="muted">{form.styles.length} selected</span></div>
        <div className="style-chip-row">
          {form.styles.length ? form.styles.slice(0, 4).map((style) => <span className="style-chip" key={style}>{style}<button type="button" onClick={() => update('styles', form.styles.filter((item) => item !== style))}><Icon name="x" size={12} /></button></span>) : <span className="muted">No styles selected</span>}
          {form.styles.length > 4 && <span className="muted">+{form.styles.length - 4} more</span>}
        </div>
      </div>
    </section>
  );
}

function CreateView({ form, setForm, config, queue, previewImage, setPreviewImage, onGenerate, onDescribe, onMetadata, metadataResult, onStop, onViewQueue, taskActive, taskId, error }) {
  const progress = queue.progress;
  const gallery = queue.gallery || [];
  const currentTask = taskId ? queue.items.find((item) => item.id === taskId) : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LOCAL GENERATION STUDIO</span>
          <h1>Turn an idea into an <em>image.</em></h1>
          <p>Focused tools for making beautiful images, without the noise.</p>
        </div>
        <div className="heading-actions">
          <Pill tone="green"><span className="status-dot" /> Engine ready</Pill>
          <button type="button" className="quiet-button"><Icon name="download" size={16} /> Import settings</button>
        </div>
      </div>
      <div className="workspace-grid">
        <div className="preview-column">
          <section className="panel preview-card">
            <div className="preview-heading">
              <div><span className="eyebrow">PREVIEW</span><h2>{progress ? 'Generating your image' : gallery.length || previewImage ? 'Your latest work' : 'Your canvas'}</h2></div>
              {queue.busy && <Pill tone="amber"><span className="status-dot" /> Queue active</Pill>}
            </div>
            <PreviewStage progress={progress} gallery={gallery} previewImage={previewImage} onSelectImage={setPreviewImage} onClearSelection={() => setPreviewImage(null)} />
          </section>
          <section className="panel queue-preview-card">
            <div className="section-label"><span><Icon name="layers" size={15} /> Recent queue</span><button type="button" className="text-button" onClick={onViewQueue}>View all <Icon name="arrow" size={13} /></button></div>
            {queue.items.length ? (
              <div className="mini-queue">
                {queue.items.slice(-3).reverse().map((item) => (
                  <div className="mini-queue-item" key={item.id}>
                    <div className={`queue-status-dot ${item.status}`} />
                    <div className="mini-queue-copy"><strong>{item.prompt || 'Untitled generation'}</strong><span>{item.performance} · {item.image_number} {item.image_number === 1 ? 'image' : 'images'}</span></div>
                    <Pill tone={item.status === 'finished' ? 'green' : item.status === 'generating' ? 'amber' : 'neutral'}>{item.status}</Pill>
                  </div>
                ))}
              </div>
            ) : <p className="muted queue-empty-copy">Your queued generations will appear here.</p>}
          </section>
        </div>
        <div className="control-column">
          <PromptCard form={form} setForm={setForm} mode={form.mode} setMode={(mode) => setForm((current) => ({ ...current, mode }))} config={config} onGenerate={onGenerate} onDescribe={onDescribe} onMetadata={onMetadata} metadataResult={metadataResult} onStop={onStop} taskActive={taskActive} taskId={taskId} error={error} />
          <GenerationSettings form={form} setForm={setForm} config={config} />
          <ModelSettings form={form} setForm={setForm} config={config} />
          {currentTask && <div className="task-note"><span className="status-dot" /> {currentTask.status === 'generating' ? 'Generating in the local engine…' : 'Waiting for the engine…'}</div>}
        </div>
      </div>
    </>
  );
}

function QueueView({ queue, onStop }) {
  return (
    <div className="subpage">
      <div className="page-heading">
        <div><span className="eyebrow">WORKSPACE</span><h1>Generation <em>queue.</em></h1><p>See what is running and what is ready for you.</p></div>
        <Pill tone={queue.busy ? 'amber' : 'green'}><span className="status-dot" /> {queue.busy ? 'Processing' : 'Idle'}</Pill>
      </div>
      <section className="panel queue-page-card">
        {queue.items.length ? queue.items.slice().reverse().map((item) => (
          <div className="queue-row" key={item.id}>
            <div className={`queue-status-dot ${item.status}`} />
            <div className="queue-row-main"><strong>{item.prompt || 'Untitled generation'}</strong><span>{item.performance} · {item.image_number} images · Seed {item.seed}</span></div>
            <div className="queue-row-meta">{item.result_count ? <Pill tone="green">{item.result_count} ready</Pill> : <Pill tone={item.status === 'generating' ? 'amber' : 'neutral'}>{item.status}</Pill>}{(item.status === 'generating' || item.status === 'pending') && <button type="button" className="icon-button" onClick={() => onStop(item.id)} aria-label="Stop task"><Icon name="pause" size={15} /></button>}</div>
          </div>
        )) : <EmptyState icon="layers" title="Nothing in the queue" body="Start a generation and it will show up here." />}
      </section>
    </div>
  );
}

function LibraryView({ items, onSelect, onDownload, onDelete }) {
  const [dateFilter, setDateFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const availableKeys = new Set(items.map(libraryItemKey));
    setSelectedKeys((current) => {
      const next = new Set([...current].filter((key) => availableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const dateOptions = useMemo(() => {
    const dates = [...new Set(items.map((item) => dateKey(itemTimestamp(item))).filter(Boolean))];
    return [
      { value: 'all', label: 'All dates' },
      { value: 'today', label: 'Today' },
      { value: '7d', label: 'Last 7 days' },
      { value: '30d', label: 'Last 30 days' },
      ...dates.map((date) => ({ value: `date:${date}`, label: formatDate(new Date(`${date}T12:00:00`)) })),
    ];
  }, [items]);

  const visibleItems = useMemo(() => {
    const now = Date.now();
    const today = dateKey(now);
    const filtered = items.filter((item) => {
      const timestamp = itemTimestamp(item);
      if (dateFilter === 'today') return dateKey(timestamp) === today;
      if (dateFilter === '7d') return timestamp >= now - (7 * 24 * 60 * 60 * 1000);
      if (dateFilter === '30d') return timestamp >= now - (30 * 24 * 60 * 60 * 1000);
      if (dateFilter.startsWith('date:')) return dateKey(timestamp) === dateFilter.slice(5);
      return true;
    });
    return filtered.slice().sort((first, second) => {
      const direction = sortOrder === 'oldest' ? 1 : -1;
      return direction * (itemTimestamp(first) - itemTimestamp(second));
    });
  }, [dateFilter, items, sortOrder]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.has(libraryItemKey(item))),
    [items, selectedKeys],
  );
  const selectedVisibleCount = visibleItems.filter((item) => selectedKeys.has(libraryItemKey(item))).length;
  const allVisibleSelected = visibleItems.length > 0 && selectedVisibleCount === visibleItems.length;
  const hasFilters = dateFilter !== 'all';
  const countLabel = visibleItems.length === items.length
    ? `${items.length} ${items.length === 1 ? 'image' : 'images'}`
    : `${visibleItems.length} of ${items.length} images`;
  const toggleSelection = (item) => {
    const key = libraryItemKey(item);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleVisibleSelection = () => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleItems.forEach((item) => next.delete(libraryItemKey(item)));
      } else {
        visibleItems.forEach((item) => next.add(libraryItemKey(item)));
      }
      return next;
    });
  };
  const clearSelection = () => setSelectedKeys(new Set());
  const toggleSelectionMode = () => {
    if (selectionMode) {
      clearSelection();
      setActionError('');
    }
    setSelectionMode((current) => !current);
  };
  const runAction = (action, clearAfter = false) => {
    if (!selectedItems.length || actionBusy) return;
    setActionError('');
    setActionBusy(true);
    Promise.resolve()
      .then(() => action(selectedItems))
      .then((success) => {
        if (success !== false && clearAfter) clearSelection();
      })
      .catch((reason) => setActionError(reason.message || 'Library action failed.'))
      .finally(() => setActionBusy(false));
  };
  const deleteSelected = () => {
    if (!selectedItems.length || actionBusy) return;
    const imageLabel = selectedItems.length === 1 ? 'this image' : `these ${selectedItems.length} images`;
    if (window.confirm(`Delete ${imageLabel} from the output folder? This cannot be undone.`)) {
      runAction(onDelete, true);
    }
  };

  return (
    <div className="subpage">
      <div className="page-heading">
        <div><span className="eyebrow">YOUR OUTPUTS</span><h1>Image <em>library.</em></h1><p>Saved generations stay here after you restart Fooocus.</p></div>
        <div className="library-heading-actions">
          <Pill>{countLabel}</Pill>
          {items.length > 0 && <button type="button" className="quiet-button" onClick={toggleSelectionMode} disabled={actionBusy}><Icon name={selectionMode ? 'check' : 'layers'} size={15} /> {selectionMode ? 'Done' : 'Select'}</button>}
        </div>
      </div>
      {items.length > 0 && (
        <div className="library-toolbar">
          <div className="library-toolbar-copy"><Icon name="layers" size={15} /><span>Browse by generation date</span></div>
          <div className="library-toolbar-fields">
            <label className="library-filter"><span>Date</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>{dateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Icon name="chevron" size={14} /></label>
            <label className="library-filter"><span>Sort</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><Icon name="chevron" size={14} /></label>
          </div>
        </div>
      )}
      {selectionMode && items.length > 0 && (
        <div className="library-selection-toolbar">
          <div className="library-selection-copy"><Icon name="check" size={15} /><span>{selectedItems.length ? `${selectedItems.length} selected` : 'Select images for batch actions'}</span></div>
          <div className="library-selection-actions">
            <button type="button" className="text-button" onClick={toggleVisibleSelection} disabled={!visibleItems.length || actionBusy}>{allVisibleSelected ? 'Deselect visible' : 'Select visible'}</button>
            {selectedItems.length > 0 && <button type="button" className="text-button" onClick={clearSelection} disabled={actionBusy}>Clear</button>}
            <button type="button" className="quiet-button" onClick={() => runAction(onDownload)} disabled={!selectedItems.length || actionBusy}><Icon name="download" size={14} /> Download</button>
            <button type="button" className="quiet-button library-delete-button" onClick={deleteSelected} disabled={!selectedItems.length || actionBusy}><Icon name="trash" size={14} /> Delete</button>
          </div>
          {actionError && <div className="library-selection-error"><Icon name="info" size={14} /> {actionError}</div>}
        </div>
      )}
      {visibleItems.length ? (
        <div className="library-grid">{visibleItems.map((item, index) => {
          const selected = selectedKeys.has(libraryItemKey(item));
          return (
            <div className="library-card" key={`${libraryItemKey(item)}-${index}`}>
              <button type="button" className={`library-image ${selected ? 'is-selected' : ''}`} onClick={() => onSelect(item)} title={item.prompt || item.name} aria-label={`Open ${item.name || `image ${index + 1}`}`}>
                <img src={item.url} alt={item.prompt || `Generated result ${index + 1}`} />
                <b className="library-ratio">{itemAspectRatio(item)}</b>
                {item.prompt && <small>{item.prompt}</small>}
                <span className="library-image-action"><Icon name="arrow" size={15} /></span>
              </button>
              {selectionMode && <label className="library-select" title={selected ? 'Deselect image' : 'Select image'}>
                <input type="checkbox" checked={selected} onChange={() => toggleSelection(item)} aria-label={selected ? `Deselect ${item.name || 'image'}` : `Select ${item.name || 'image'}`} />
              </label>}
            </div>
          );
        })}</div>
      ) : (
        <section className="panel library-empty">
          <EmptyState
            icon="image"
            title={items.length ? 'No images match this date' : 'Your library is empty'}
            body={items.length ? 'Try another date or clear the filter.' : 'Generated images will collect here as you create.'}
            action={items.length && hasFilters ? <button type="button" className="quiet-button" onClick={() => setDateFilter('all')}>Show all images</button> : null}
          />
        </section>
      )}
    </div>
  );
}

function LibraryLightbox({ item, onClose }) {
  const metadata = item.metadata || {};
  const operation = item.operation || (metadata.upscale_fast ? 'Upscale' : 'Generation');
  const prompt = item.prompt || metadata.prompt || 'No prompt recorded.';
  const detailRows = [
    ['Process', operation],
    ['Quality', metadata.performance],
    ['Image size', item.size || (item.width && item.height ? `${item.width} × ${item.height}` : '')],
    ['Aspect ratio', itemAspectRatio(item)],
    ['Generated', formatDateTime(item.modifiedAt)],
    ['Steps', metadata.steps],
    ['Seed', metadata.seed],
    ['Guidance scale', metadata.guidance_scale],
    ['Sharpness', metadata.sharpness],
    ['Model', metadata.base_model],
    ['Sampler', metadata.sampler],
  ].filter(([, value]) => metadataText(value));

  return (
    <div className="lightbox library-lightbox" role="dialog" aria-modal="true" aria-label="Image details" onClick={onClose}>
      <div className="library-lightbox-shell" onClick={(event) => event.stopPropagation()}>
        <div className="library-lightbox-media">
          <img src={item.url} alt={prompt} />
          <b className="library-ratio">{itemAspectRatio(item)}</b>
        </div>
        <aside className="library-details">
          <div className="library-details-heading"><div><span className="eyebrow">IMAGE DETAILS</span><h2>{operation}</h2></div><button type="button" className="lightbox-close" onClick={onClose} aria-label="Close image details"><Icon name="close" size={20} /></button></div>
          <div className="library-detail-grid">{detailRows.map(([label, value]) => <div className="library-detail" key={label}><span>{label}</span><strong>{metadataText(value)}</strong></div>)}</div>
          <div className="library-detail-block"><span>Basic prompt</span><p>{prompt}</p></div>
          {metadata.negative_prompt && <div className="library-detail-block"><span>Negative prompt</span><p>{metadataText(metadata.negative_prompt)}</p></div>}
          <div className="library-details-actions"><a className="lightbox-download" href={item.url} download={item.name || 'fooocus-result'}><Icon name="download" size={15} /> Download image</a><span className="library-file-name">{item.name}</span></div>
        </aside>
      </div>
    </div>
  );
}

function StylesView({ config, form, setForm }) {
  const [query, setQuery] = useState('');
  const styles = useMemo(() => (config?.styles || []).filter((style) => style.toLowerCase().includes(query.toLowerCase())), [config, query]);
  const toggle = (style) => setForm((current) => ({ ...current, styles: current.styles.includes(style) ? current.styles.filter((item) => item !== style) : [...current.styles, style] }));
  return (
    <div className="subpage">
      <div className="page-heading"><div><span className="eyebrow">VISUAL LANGUAGE</span><h1>Find your <em>style.</em></h1><p>Mix and match styles to shape the mood of your generation.</p></div><Pill tone="green">{form.styles.length} active</Pill></div>
      <section className="panel style-page-card">
        <div className="search-field"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search styles..." /><kbd>/</kbd></div>
        <div className="style-grid">{styles.map((style) => <button type="button" className={`style-option ${form.styles.includes(style) ? 'selected' : ''}`} key={style} onClick={() => toggle(style)}><span className="style-swatch" /><span>{style}</span>{form.styles.includes(style) && <Icon name="check" size={15} />}</button>)}</div>
      </section>
    </div>
  );
}

function ModelsView({ config, form, setForm, onRefresh }) {
  return (
    <div className="subpage">
      <div className="page-heading"><div><span className="eyebrow">LOCAL ENGINE</span><h1>Models & <em>presets.</em></h1><p>Choose the models available on this machine.</p></div><button type="button" className="quiet-button" onClick={onRefresh}><Icon name="refresh" size={15} /> Refresh files</button></div>
      <section className="panel models-page-card">
        <div className="model-list">
          {(config?.models || []).map((model, index) => <div className="model-list-row" key={model}><div className="model-mark">{String(index + 1).padStart(2, '0')}</div><div><strong>{model}</strong><span>SDXL checkpoint</span></div><Pill tone={form.baseModel === model ? 'green' : 'neutral'}>{form.baseModel === model ? 'Active' : 'Available'}</Pill><button type="button" className="text-button" onClick={() => setForm((current) => ({ ...current, baseModel: model }))}>{form.baseModel === model ? 'Selected' : 'Use model'}</button></div>)}
          {!config?.models?.length && <EmptyState icon="sliders" title="No checkpoints found" body="Add a model to models/checkpoints and refresh the file list." />}
        </div>
        <div className="preset-block"><div className="section-label"><span>Presets</span><span className="muted">Starting points for your workflow</span></div><div className="preset-grid">{(config?.presets || []).map((preset) => <button type="button" key={preset} onClick={() => {}}><span className="preset-icon"><Icon name="sparkles" size={16} /></span><span>{preset}</span><Icon name="arrow" size={14} /></button>)}</div></div>
      </section>
    </div>
  );
}

function EngineCard({ system, className = '' }) {
  const gpu = system?.gpu;
  const memory = system?.memory;
  const vramPercent = Math.min(100, Math.max(0, Number(gpu?.memoryPercent ?? 0)));
  const ramPercent = Math.min(100, Math.max(0, Number(memory?.usagePercent ?? 0)));
  const engineDevice = gpu?.available ? gpu.name : (system?.cpu?.name || 'Detecting hardware…');
  const engineDescription = system
    ? `${system.cpu.name} · ${system.cpu.cores} logical cores`
    : 'Reading system specifications…';

  return (
    <section className={`engine-card ${className}`}>
      <div className="engine-card-top"><span className="status-dot" /><span>LOCAL ENGINE</span><Pill tone={system ? 'green' : 'amber'}>{system ? 'Live' : 'Reading'}</Pill></div>
      <strong title={engineDevice}>{engineDevice}</strong>
      <span title={engineDescription}>{engineDescription}</span>
      <div className="engine-stats">
        <div><span>GPU</span><strong>{formatPercent(gpu?.usagePercent)}</strong></div>
        <div><span>CPU</span><strong>{formatPercent(system?.cpu?.usagePercent)}</strong></div>
      </div>
      <div className="engine-resources">
        <div className="engine-resource">
          <div className="engine-resource-label"><span>VRAM</span><strong>{formatPercent(gpu?.memoryPercent)}</strong></div>
          <div className="engine-meter"><span style={{ width: `${vramPercent}%` }} /></div>
          <small className="engine-resource-value">{gpu?.available ? `${formatBytes(gpu.memoryUsedBytes)} / ${formatBytes(gpu.memoryTotalBytes)}` : 'Unavailable'}</small>
        </div>
        <div className="engine-resource">
          <div className="engine-resource-label"><span>RAM</span><strong>{formatPercent(memory?.usagePercent)}</strong></div>
          <div className="engine-meter"><span style={{ width: `${ramPercent}%` }} /></div>
          <small className="engine-resource-value">{formatBytes(memory?.usedBytes)} / {formatBytes(memory?.totalBytes)}</small>
        </div>
      </div>
    </section>
  );
}

function App() {
  const { config, error: configError, reload, refresh: refreshConfig } = useConfig();
  const system = useSystemStatus();
  const [view, setView] = useState('create');
  const [form, setForm] = useState({ ...EMPTY_FORM, mode: 'text' });
  const [queue, setQueue] = useState({ busy: false, items: [], progress: null, gallery: [] });
  const [taskId, setTaskId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [notice, setNotice] = useState('');
  const [metadataResult, setMetadataResult] = useState(null);
  const [library, setLibrary] = useState([]);
  const [sessionGallery, setSessionGallery] = useState([]);
  const [libraryLightbox, setLibraryLightbox] = useState(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    if (!config) return;
    setForm((current) => ({
      ...current,
      prompt: current.prompt || config.defaultPrompt || '',
      negativePrompt: current.negativePrompt || config.defaultNegativePrompt || '',
      performance: config.defaultPerformance || current.performance,
      aspectRatios: current.aspectRatios.length === 1 && current.aspectRatios[0] === EMPTY_FORM.aspectRatios[0] ? [config.defaultAspectRatio] : current.aspectRatios,
      imageNumber: config.defaultImageNumber || current.imageNumber,
      outputFormat: config.defaultOutputFormat || current.outputFormat,
      guidanceScale: config.defaultGuidanceScale ?? current.guidanceScale,
      sharpness: config.defaultSharpness ?? current.sharpness,
      baseModel: current.baseModel || config.defaultBaseModel || config.models?.[0] || '',
      refinerModel: config.defaultRefinerModel || current.refinerModel,
      refinerSwitch: config.defaultRefinerSwitch ?? current.refinerSwitch,
      styles: current.styles.length ? current.styles : (config.defaultStyles || []),
      loras: config.defaultLoras || current.loras,
      sampler: config.samplers?.includes(current.sampler) ? current.sampler : (config.samplers?.[0] || current.sampler),
      scheduler: config.schedulers?.includes(current.scheduler) ? current.scheduler : (config.schedulers?.[0] || current.scheduler),
    }));
  }, [config]);

  const loadLibrary = useCallback(() => {
    return fetch('/api/library')
      .then((response) => apiError(response, 'Unable to read the image library.'))
      .then((response) => response.json())
      .then((snapshot) => {
        setLibrary((snapshot.items || []).filter((item) => item?.url));
        return snapshot;
      })
      .catch(() => {});
  }, []);

  const downloadLibrary = useCallback((selectedItems) => {
    const paths = [...new Set(selectedItems.map(libraryItemPath).filter(Boolean))];
    if (!paths.length) return Promise.reject(new Error('Select at least one library image.'));
    return fetch('/api/library/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    })
      .then((response) => apiError(response, 'Unable to download the selected images.'))
      .then((response) => response.blob())
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'fooocus-library.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        setNotice(`Downloaded ${selectedItems.length} ${selectedItems.length === 1 ? 'image' : 'images'}.`);
        return true;
      });
  }, []);

  const deleteLibrary = useCallback((selectedItems) => {
    const paths = [...new Set(selectedItems.map(libraryItemPath).filter(Boolean))];
    if (!paths.length) return Promise.reject(new Error('Select at least one library image.'));
    return fetch('/api/library/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    })
      .then((response) => apiError(response, 'Unable to delete the selected images.'))
      .then((response) => response.json())
      .then(({ deleted }) => {
        const deletedPaths = new Set(paths);
        setSessionGallery((current) => current.filter((url) => !deletedPaths.has(mediaPathFromUrl(url))));
        setNotice(`Deleted ${deleted} ${deleted === 1 ? 'image' : 'images'}.`);
        return loadLibrary().then(() => true);
      });
  }, [loadLibrary]);

  const pollQueue = useCallback(() => {
    return fetch('/api/queue')
      .then((response) => apiError(response, 'Unable to read the generation queue.'))
      .then((response) => response.json())
      .then((snapshot) => {
        setQueue(snapshot);
        if (taskId) {
          const current = snapshot.items.find((item) => item.id === taskId);
          if (current?.status === 'finished') {
            setTaskId(null);
            setSessionGallery(snapshot.gallery || []);
            setNotice('Generation finished. Your results are ready.');
            loadLibrary();
          }
        }
        return snapshot;
      })
      .catch(() => {});
  }, [loadLibrary, taskId]);

  useEffect(() => {
    pollQueue();
    const interval = window.setInterval(pollQueue, 700);
    return () => window.clearInterval(interval);
  }, [pollQueue]);

  useEffect(() => {
    loadLibrary();
    const interval = window.setInterval(loadLibrary, 5000);
    return () => window.clearInterval(interval);
  }, [loadLibrary]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  const generate = () => {
    setSubmitError('');
    const currentTab = {
      batch: 'batch_upscale',
      inpaint: 'inpaint',
      ip: 'ip',
      enhance: 'enhance',
    }[form.mode] || 'uov';
    const payload = {
      ...form,
      inputImageEnabled: !['text', 'describe', 'metadata'].includes(form.mode),
      currentTab,
      enhanceImage: form.mode === 'enhance' ? form.inputImage : null,
      inpaintImage: form.mode === 'inpaint' ? form.inputImage : null,
      imagePromptImage: form.mode === 'ip' ? form.inputImage : null,
      imagePrompts: form.mode === 'ip' && form.inputImage ? [{
        image: form.inputImage,
        type: config?.imagePromptTypes?.[0],
        stopAt: form.imagePromptStopAt,
        weight: form.imagePromptWeight,
      }] : [],
      enhance: form.mode === 'enhance',
    };
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((response) => apiError(response, 'Unable to start generation.'))
      .then((response) => response.json())
      .then(({ taskId: createdTaskId }) => {
        setTaskId(createdTaskId);
        setPreviewImage(null);
        setSessionGallery([]);
        setView('create');
        setNotice('Added to the generation queue.');
      })
      .catch((reason) => setSubmitError(reason.message));
  };

  const describe = () => {
    if (!form.inputImage) return;
    setSubmitError('');
    fetch('/api/describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: form.inputImage, modes: config?.describeTypes || [], applyStyles: true }),
    })
      .then((response) => apiError(response, 'Unable to describe this image.'))
      .then((response) => response.json())
      .then((result) => {
        setForm((current) => ({
          ...current,
          prompt: result.prompt || current.prompt,
          styles: result.styles?.length ? result.styles : current.styles,
        }));
        setNotice('Image description added to your prompt.');
      })
      .catch((reason) => setSubmitError(reason.message));
  };

  const readMetadata = () => {
    if (!form.inputImage) return;
    setSubmitError('');
    fetch('/api/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: form.inputImage }),
    })
      .then((response) => apiError(response, 'Unable to read image metadata.'))
      .then((response) => response.json())
      .then((result) => {
        const metadata = result.metadata || {};
        let styles = metadata.styles;
        if (typeof styles === 'string') {
          try {
            styles = JSON.parse(styles.replaceAll("'", '"'));
          } catch {
            styles = null;
          }
        }
        setMetadataResult(metadata);
        setForm((current) => ({
          ...current,
          prompt: metadata.prompt || current.prompt,
          negativePrompt: metadata.negative_prompt || current.negativePrompt,
          styles: Array.isArray(styles) ? styles : current.styles,
          seed: metadata.seed || current.seed,
          guidanceScale: Number(metadata.guidance_scale) || current.guidanceScale,
          sharpness: Number(metadata.sharpness) || current.sharpness,
        }));
        setNotice('Metadata loaded into the generation form.');
      })
      .catch((reason) => setSubmitError(reason.message));
  };

  const stop = (id = taskId) => {
    if (!id) return;
    fetch(`/api/tasks/${id}/stop`, { method: 'POST' })
      .then((response) => apiError(response, 'Unable to stop this task.'))
      .then(() => setNotice('Generation stopped.'))
      .catch((reason) => setSubmitError(reason.message));
  };

  const refresh = () => {
    refreshConfig().then(() => setNotice('Model files refreshed.')).catch(() => {});
  };

  const activeCount = queue.items.filter((item) => item.status === 'pending' || item.status === 'generating').length;
  const sessionItems = sessionGallery.map((url) => ({ url, path: mediaPathFromUrl(url), name: 'Current generation', metadata: {}, operation: 'Generation' }));
  const libraryItems = [
    ...library,
    ...sessionItems.filter((item) => !library.some((libraryItem) => libraryItem.url === item.url)),
  ];
  const viewTitle = navItems.find((item) => item.id === view)?.label || 'Create';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Icon name="sparkle" size={20} /></div><span>fooocus<span className="brand-dot">.</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav">
          {navItems.map((item) => (
            <button type="button" className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}>
              <Icon name={item.icon} size={17} /><span>{item.label}</span>{item.id === 'queue' && activeCount > 0 && <b>{activeCount}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <EngineCard system={system} className="sidebar-engine-card" />
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs"><span>Fooocus Studio</span><Icon name="arrow" size={13} /><strong>{viewTitle}</strong></div>
          <div className="topbar-actions"><span className="connection-label"><span className="status-dot" /> Connected</span><button type="button" className="icon-button" aria-label="Toggle theme" onClick={() => setDark((value) => !value)}><Icon name={dark ? 'sun' : 'moon'} size={17} /></button><button type="button" className="avatar top-avatar">F</button></div>
        </header>
        <div className="content">
          <EngineCard system={system} className="page-engine-card" />
          {configError && <div className="page-error"><Icon name="info" size={16} /> {configError} <button type="button" onClick={refresh}>Retry</button></div>}
          {view === 'create' && <CreateView form={form} setForm={setForm} config={config} queue={{ ...queue, gallery: sessionGallery }} previewImage={previewImage} setPreviewImage={setPreviewImage} onGenerate={generate} onDescribe={describe} onMetadata={readMetadata} metadataResult={metadataResult} onStop={() => stop()} onViewQueue={() => setView('queue')} taskActive={Boolean(taskId)} taskId={taskId} error={submitError} />}
          {view === 'queue' && <QueueView queue={queue} onStop={stop} />}
          {view === 'library' && <LibraryView items={libraryItems} onSelect={setLibraryLightbox} onDownload={downloadLibrary} onDelete={deleteLibrary} />}
          {view === 'styles' && <StylesView config={config} form={form} setForm={setForm} />}
          {view === 'models' && <ModelsView config={config} form={form} setForm={setForm} onRefresh={refresh} />}
        </div>
      </main>
      {libraryLightbox && <LibraryLightbox item={libraryLightbox} onClose={() => setLibraryLightbox(null)} />}
      {notice && <div className="toast"><span className="toast-icon"><Icon name="check" size={14} /></span>{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
