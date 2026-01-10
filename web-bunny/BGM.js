  // ✅ FIX強化：src差し替え後に「canplayで追い再生」＋「error理由表示」＋「少し待って再試行」
  async function tryPlayBgm(src, keyHint = null) {
    ensureBgmAudio();
    if (!src) return false;

    const key = keyHint || resolveKeyBySrc(src);
    if (key && !isOwned(key)) { stopBgm(); return false; }

    const abs = toAbsUrlEncoded(src);

    // 状態チェック
    if (!bgmSettings.enabled) return false;
    if (!unlocked) {
      __lastPlayErr = "locked";
      return false;
    }

    // --- 追い再生（src切替直後に落ちた時の保険） ---
    // 1回だけ有効な「追い再生」フラグ
    audio.__needRetryPlay = false;

    // canplay で追い再生（src差し替え直後に play が落ちる環境がある）
    const onCanPlay = async () => {
      if (!audio.__needRetryPlay) return;
      audio.__needRetryPlay = false;
      try {
        const p2 = audio.play();
        if (p2 && typeof p2.then === "function") await p2;
        __lastPlayErr = "";
      } catch (e2) {
        __lastPlayErr = String(e2?.name || e2?.message || e2 || "play failed");
        toast(`⚠️ BGM再生失敗：${__lastPlayErr}`);
      }
    };

    // error の内容を出す（ネットワーク/404/デコードなど）
    const onError = () => {
      const err = audio.error;
      const code = err?.code;
      const map = {
        1: "ABORTED(中断)",
        2: "NETWORK(通信)",
        3: "DECODE(デコード不可)",
        4: "SRC_NOT_SUPPORTED(未対応/404など)",
      };
      __lastPlayErr = `audio.error code=${code}${map[code] ? `:${map[code]}` : ""}`;
      toast(`⚠️ BGM読み込み失敗：${__lastPlayErr}`);
    };

    // リスナー重複防止
    if (!audio.__milkpopRetryHooked) {
      audio.addEventListener("canplay", onCanPlay);
      audio.addEventListener("canplaythrough", onCanPlay);
      audio.addEventListener("loadeddata", onCanPlay);
      audio.addEventListener("error", onError);
      audio.__milkpopRetryHooked = true;
    } else {
      // 既にhook済みでも、今回の再生で追い再生は効かせたいのでフラグだけ使う
      // （onCanPlay は常駐）
    }

    // src変更時は確実にリセット
    const changed = (audio.src !== abs);
    if (changed) {
      try { audio.pause(); } catch {}
      audio.src = abs;
      try { audio.load(); } catch {}
      try { audio.currentTime = 0; } catch {}
      audio.__needRetryPlay = true; // ★ここが肝：canplayで追い再生
    }

    applyBgmVolume();

    // まずは即 play を試す（成功する環境はここで鳴る）
    try {
      const p = audio.play();
      if (p && typeof p.then === "function") await p;
      __lastPlayErr = "";
      audio.__needRetryPlay = false;
      return true;
    } catch (e) {
      __lastPlayErr = String(e?.name || e?.message || e || "play failed");
      // ここで落ちても、src差し替え直後なら canplay で追い再生する
      toast(`⚠️ BGM再生失敗：${__lastPlayErr}`);

      // 念のため少し待ってもう一回（canplayが来ない環境の保険）
      if (audio.__needRetryPlay) {
        setTimeout(() => {
          try { audio.play().catch(() => {}); } catch {}
        }, 180);
      }
      return false;
    }
  }
