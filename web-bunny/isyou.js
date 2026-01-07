function applyTransform(imgEl, bunny, it) {
  const flip = !!bunny?.wrap?.classList?.contains("flip");
  const fx = flip ? -1 : 1;

  const ox = Number(it.offsetX) || 0;
  const oy = Number(it.offsetY) || 0;
  const sc = Number(it.scale) || 1;

  // ★ 上端基準で固定（anchorY廃止）
  imgEl.style.top = `0px`;

  const baseT =
    `translate(calc(-50% + ${ox}px), ${oy}px) ` +
    `scale(${sc}) scaleX(${fx})`;

  imgEl.style.transform = baseT;
  imgEl.style.zIndex = String(it.z || 10);
}
