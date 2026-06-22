import { useState, useRef, useEffect } from 'react';
import './OtpInput.css';

export default function OtpInput({ value, onChange, length = 6, disabled = false }) {
  const inputs = useRef([]);
  const digits = value.padEnd(length, ' ').split('').slice(0, length);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const update = (index, char) => {
    if (!/^\d?$/.test(char)) return;
    const arr = digits.map((d) => (d === ' ' ? '' : d));
    arr[index] = char;
    const next = arr.join('').slice(0, length);
    onChange(next);
    if (char && index < length - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
    inputs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="otp-input" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={d.trim()}
          disabled={disabled}
          className="otp-digit"
          onChange={(e) => update(i, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
