import mongoose from 'mongoose';

/**
 * router.param('id', validIdParam): a malformed :id can't match any record,
 * so answer 404 instead of letting Mongoose throw a CastError (500).
 */
export function validIdParam(req, res, next, id) {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Not found' });
  next();
}

/** Reject malformed id filters in the query string (?location=, ?repId=, ...) with 400. */
export function validIdQuery(...names) {
  return (req, res, next) => {
    for (const name of names) {
      const value = req.query[name];
      if (value === undefined || value === '') continue;
      if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
        return res.status(400).json({ error: `Invalid ${name} id` });
      }
    }
    next();
  };
}
