import { useEffect, useCallback, useRef, useState } from 'react';

/** Pull browser/password-manager values into React state once autofill completes. */
export function useAutofillSync(formRef, mergeValues, { enabled = true } = {}) {
  const mergeRef = useRef(mergeValues);
  mergeRef.current = mergeValues;

  const syncFromDom = useCallback(() => {
    const form = formRef.current;
    if (!form) return;

    const values = {};
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name || el.type === 'hidden') return;
      const val = el.value?.trim?.() ?? el.value;
      if (val) values[el.name] = val;
    });

    if (Object.keys(values).length) {
      mergeRef.current(values);
    }
  }, [formRef]);

  useEffect(() => {
    if (!enabled) return undefined;

    const delays = [50, 150, 400, 800, 1500].map((ms) => setTimeout(syncFromDom, ms));

    const onAnimation = (e) => {
      if (e.animationName === 'onAutoFillStart') syncFromDom();
    };

    document.addEventListener('animationstart', onAnimation, true);
    window.addEventListener('pageshow', syncFromDom);

    return () => {
      delays.forEach(clearTimeout);
      document.removeEventListener('animationstart', onAnimation, true);
      window.removeEventListener('pageshow', syncFromDom);
    };
  }, [formRef, syncFromDom, enabled]);
}

/** Prevent controlled inputs from clearing browser autofill until the user focuses the field. */
export function useAutofillUnlock() {
  const unlockedRef = useRef(false);
  const [, bump] = useState(0);

  const unlock = useCallback(() => {
    if (!unlockedRef.current) {
      unlockedRef.current = true;
      bump((n) => n + 1);
    }
  }, []);

  return {
    readOnly: !unlockedRef.current,
    unlock,
    onFocus: unlock,
  };
}
