import { Link } from 'react-router-dom';

export default function Breadcrumbs({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="breadcrumb-item">
            {i > 0 && <span className="breadcrumb-sep">/</span>}
            {isLast || !item.to ? (
              <span className="breadcrumb-current">{item.label}</span>
            ) : (
              <Link to={item.to} className="breadcrumb-link">{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
