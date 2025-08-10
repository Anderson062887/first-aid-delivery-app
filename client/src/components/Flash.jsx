export default function Flash({ kind = 'success', children }) {
  const bg = kind === 'success' ? '#eaf7ea' : kind === 'error' ? '#fdecec' : '#eef3ff';
  const color = '#1f5132';
  const border = kind === 'success' ? '#b7e1b7' : kind === 'error' ? '#f5b5b5' : '#c9d7ff';

  return (
    <div style={{
      background: bg,
      color,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 12
    }}>
      {children}
    </div>
  );
}
