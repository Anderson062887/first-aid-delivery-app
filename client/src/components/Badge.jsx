export default function Badge({ kind = 'default', children }) {
  const styles = {
    base: {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 12,
      lineHeight: '18px',
      border: '1px solid transparent',
      whiteSpace: 'nowrap'
    },
    variants: {
      completed: { background: '#eaf7ea', color: '#1f5132', borderColor: '#b7e1b7' },
      partial:   { background: '#fff8e6', color: '#6b4e00', borderColor: '#f3d8a2' },
      no_access: { background: '#f0f4f8', color: '#334e68', borderColor: '#cbd2d9' },
      skipped:   { background: '#f0f4f8', color: '#334e68', borderColor: '#cbd2d9' },
      default:   { background: '#eef3ff', color: '#243b6b', borderColor: '#c9d7ff' }
    }
  };

  const style = { ...styles.base, ...(styles.variants[kind] || styles.variants.default) };
  return <span style={style}>{children}</span>;
}
