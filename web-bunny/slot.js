/* 3×3 スロット窓：筐体の白い枠の中に％で固定 */
#slotStarMachinePanel3x3 .grid{
  position:absolute;

  /* ★ここが位置決め：スクショ基準で「白い窓」に合わせた値 */
  left: 50%;
  top: 52.5%;
  transform: translate(-50%, -50%);

  width: 72%;
  height: 46%;

  display:grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4.5%;
}

/* マス */
#slotStarMachinePanel3x3 .cell{
  background: rgba(255,255,255,0.10);
  border-radius: 12px;
  display:flex;
  align-items:center;
  justify-content:center;
}

/* 絵柄はマスに収める（はみ出し防止） */
#slotStarMachinePanel3x3 .cell img{
  width: 78%;
  height: 78%;
  object-fit: contain;
}
