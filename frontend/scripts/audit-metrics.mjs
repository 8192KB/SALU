export function inspectRender() {
  const rgba = (value) => {
    const parts = value.match(/[\d.]+/g)?.map(Number);
    return parts?.length >= 3 ? [...parts.slice(0, 3), parts[3] ?? 1] : [0, 0, 0, 0];
  };
  const luminance = (color) =>
    color
      .slice(0, 3)
      .map((v) => {
        const n = v / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      })
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const background = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement)
      layers.unshift(rgba(getComputedStyle(node).backgroundColor));
    return layers.reduce(
      (under, over) => over.slice(0, 3).map((v, i) => v * over[3] + under[i] * (1 - over[3])),
      [255, 255, 255],
    );
  };
  const dialog = document.querySelector('dialog[open]');
  const candidates = Array.from((dialog ?? document).querySelectorAll('*')).filter(
    (element) =>
      element instanceof HTMLElement &&
      element.getClientRects().length &&
      !element.closest('[hidden], [inert]') &&
      getComputedStyle(element).visibility !== 'hidden',
  );
  const contrast = [];
  for (const element of candidates) {
    if (
      !Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      )
    )
      continue;
    const style = getComputedStyle(element);
    if (style.opacity !== '1' || element.closest(':disabled')) continue;
    const foreground = rgba(style.color);
    const bg = background(element);
    const a = luminance(foreground);
    const b = luminance(bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const floor =
      parseFloat(style.fontSize) >= 24 ||
      (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700)
        ? 3
        : 4.5;
    if (ratio + 0.05 < floor)
      contrast.push({
        tag: element.tagName,
        class: element.className,
        text: element.textContent.trim().slice(0, 60),
        ratio: Number(ratio.toFixed(2)),
        floor,
      });
  }
  const smallTargets = candidates
    .filter((e) => e.matches('a[href], button, summary') && !e.matches(':disabled'))
    .flatMap((e) => {
      const r = e.getBoundingClientRect();
      return r.width < 44 || r.height < 44
        ? [
            {
              tag: e.tagName,
              class: e.className,
              label: e.getAttribute('aria-label') ?? e.textContent.trim().slice(0, 40),
              width: r.width,
              height: r.height,
            },
          ]
        : [];
    });
  return { contrast, smallTargets };
}
