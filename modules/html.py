import html
import re


progress_html = '''
<div class="loader-container">
  <div class="loader"></div>
  <div class="progress-container">
    <progress value="*number*" max="100"></progress>
  </div>
  <span>*text*</span>
</div>
'''


def make_progress_html(number, text):
    return progress_html.replace('*number*', str(number)).replace('*text*', text)


def make_queue_html(items):
    if len(items) == 0:
        return '<div class="prompt-queue-empty">No prompts in the queue.</div>'

    cards = []
    for item in items:
        prompt = html.escape(str(item.get('prompt', ''))).replace('\n', '<br>')
        if prompt == '':
            prompt = '<em>Empty prompt</em>'

        negative_prompt = html.escape(str(item.get('negative_prompt', ''))).replace('\n', '<br>')
        aspect_ratios = item.get('aspect_ratios', [])
        aspect_ratios = ', '.join(
            html.escape(re.sub(r'<[^>]*>', '', str(ratio)).replace('\u2223', '|').strip())
            for ratio in aspect_ratios
        )
        styles = item.get('styles', [])
        styles = ', '.join(html.escape(str(style)) for style in styles)
        status = html.escape(str(item.get('status', 'pending')))
        status_class = status if status in ('pending', 'generating', 'finished') else 'pending'

        details = [
            f"Images: {html.escape(str(item.get('image_number', 1)))}",
            f"Seed: {html.escape(str(item.get('seed', '')))}",
            f"Performance: {html.escape(str(item.get('performance', '')))}",
        ]
        if aspect_ratios:
            details.append(f"Ratios: {aspect_ratios}")
        if styles:
            details.append(f"Styles: {styles}")
        result_count = item.get('result_count', 0)
        if result_count:
            details.append(f"Results: {html.escape(str(result_count))}")

        negative_html = ''
        if negative_prompt:
            negative_html = f'<div class="prompt-queue-negative"><strong>Negative:</strong> {negative_prompt}</div>'

        cards.append(
            f'<div class="prompt-queue-item">'
            f'<div class="prompt-queue-header">'
            f'<strong>#{html.escape(str(item.get("id", "")))}</strong>'
            f'<span class="prompt-queue-status {status_class}">{status}</span>'
            f'</div>'
            f'<div class="prompt-queue-prompt">{prompt}</div>'
            f'{negative_html}'
            f'<div class="prompt-queue-details">{" · ".join(details)}</div>'
            f'</div>'
        )

    return '<div class="prompt-queue-list">' + ''.join(cards) + '</div>'
