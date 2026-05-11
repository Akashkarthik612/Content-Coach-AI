import styles from './Button.module.css';

export function Button({ variant = 'primary', size, onClick, disabled, children, type = 'button' }) {
  const cls = [
    styles.btn,
    styles[variant],
    size === 'sm' ? styles.sm : '',
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
