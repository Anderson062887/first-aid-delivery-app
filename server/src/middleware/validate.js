// server/src/middleware/validate.js

/**
 * Simple input validation middleware.
 * Usage: validate(schema) where schema is an object with field validators.
 *
 * Example:
 * validate({
 *   body: {
 *     name: { required: true, type: 'string', maxLength: 100 },
 *     quantity: { required: true, type: 'number', min: 0 }
 *   }
 * })
 */
export function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [source, fields] of Object.entries(schema)) {
      const data = req[source];
      if (!data && Object.keys(fields).some(f => fields[f].required)) {
        errors.push(`Missing ${source}`);
        continue;
      }

      for (const [field, rules] of Object.entries(fields)) {
        const value = data?.[field];
        const fieldPath = `${source}.${field}`;

        // Required check
        if (rules.required && (value === undefined || value === null || value === '')) {
          errors.push(`${field} is required`);
          continue;
        }

        // Skip further validation if not provided and not required
        if (value === undefined || value === null) continue;

        // Type check
        if (rules.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (rules.type === 'array' && !Array.isArray(value)) {
            errors.push(`${field} must be an array`);
          } else if (rules.type !== 'array' && actualType !== rules.type) {
            errors.push(`${field} must be a ${rules.type}`);
          }
        }

        // String validations
        if (typeof value === 'string') {
          if (rules.minLength && value.length < rules.minLength) {
            errors.push(`${field} must be at least ${rules.minLength} characters`);
          }
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`${field} must be at most ${rules.maxLength} characters`);
          }
          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push(`${field} has invalid format`);
          }
          if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
          }
        }

        // Number validations
        if (typeof value === 'number') {
          if (rules.min !== undefined && value < rules.min) {
            errors.push(`${field} must be at least ${rules.min}`);
          }
          if (rules.max !== undefined && value > rules.max) {
            errors.push(`${field} must be at most ${rules.max}`);
          }
          if (rules.integer && !Number.isInteger(value)) {
            errors.push(`${field} must be an integer`);
          }
        }

        // Array validations
        if (Array.isArray(value)) {
          if (rules.minItems && value.length < rules.minItems) {
            errors.push(`${field} must have at least ${rules.minItems} items`);
          }
          if (rules.maxItems && value.length > rules.maxItems) {
            errors.push(`${field} must have at most ${rules.maxItems} items`);
          }
        }

        // Custom validator
        if (rules.validate && typeof rules.validate === 'function') {
          const result = rules.validate(value, req);
          if (result !== true) {
            errors.push(typeof result === 'string' ? result : `${field} is invalid`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    next();
  };
}

// Common validation schemas
export const schemas = {
  delivery: {
    body: {
      location: { required: true, type: 'string' },
      box: { required: true, type: 'string' },
      lines: { required: true, type: 'array', minItems: 1 }
    }
  },
  visit: {
    body: {
      location: { required: true, type: 'string' }
    }
  },
  visitSubmit: {
    body: {
      outcome: {
        type: 'string',
        enum: ['completed', 'partial', 'no_access', 'skipped']
      }
    }
  },
  item: {
    body: {
      name: { required: true, type: 'string', maxLength: 200 },
      pricePerPack: { required: true, type: 'number', min: 0 }
    }
  },
  location: {
    body: {
      name: { required: true, type: 'string', maxLength: 200 }
    }
  },
  user: {
    body: {
      email: { required: true, type: 'string', maxLength: 100 },
      name: { required: true, type: 'string', maxLength: 100 },
      roles: { type: 'array' }
    }
  }
};
