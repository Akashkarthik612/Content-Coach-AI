import styles from './Input.module.css';

export function Input({ label, id, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className={styles.wrapper}>
      {label && <label className={styles.label} htmlFor={id}>{label}</label>}
      <input
        id={id}
        type={type}
        className={styles.input}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}
