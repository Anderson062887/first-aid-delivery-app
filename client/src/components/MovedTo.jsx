import { Navigate, useParams } from 'react-router-dom';

// Send an old address to its new one, keeping :id (e.g. /items/5/edit -> /settings/items/5/edit)
export default function MovedTo({ to }) {
  const { id } = useParams();
  return <Navigate replace to={id ? to.replace(':id', id) : to} />;
}
