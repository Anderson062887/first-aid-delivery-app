import bcrypt from 'bcryptjs';

export const createUser = async (User, overrides = {}) => {
  const defaults = {
    name: 'Test User',
    email: `test${Date.now()}@example.com`,
    passwordHash: await bcrypt.hash('password123', 10),
    roles: ['rep'],
    active: true
  };
  return User.create({ ...defaults, ...overrides });
};

export const createAdminUser = async (User, overrides = {}) => {
  return createUser(User, { roles: ['admin'], ...overrides });
};

export const createLocation = async (Location, overrides = {}) => {
  return Location.create({
    name: `Location ${Date.now()}`,
    address: { street: '123 Test St', city: 'Test City', state: 'TS', zip: '12345' },
    ...overrides
  });
};

export const createBox = async (Box, locationId, overrides = {}) => {
  return Box.create({
    label: `Box ${Date.now()}`,
    location: locationId,
    size: 'M',
    items: [],
    ...overrides
  });
};

export const createItem = async (Item, overrides = {}) => {
  return Item.create({
    name: `Item ${Date.now()}`,
    sku: `SKU${Date.now()}`,
    packaging: 'each',
    unitsPerPack: 1,
    pricePerPack: 10.00,
    active: true,
    ...overrides
  });
};

export const createVisit = async (Visit, repId, locationId, overrides = {}) => {
  return Visit.create({
    rep: repId,
    location: locationId,
    status: 'open',
    startedAt: new Date(),
    ...overrides
  });
};

export const createDelivery = async (Delivery, { locationId, boxId, visitId, lines }, overrides = {}) => {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return Delivery.create({
    location: locationId,
    box: boxId,
    visit: visitId,
    lines,
    subtotal,
    tax: 0,
    total: subtotal,
    deliveredAt: new Date(),
    ...overrides
  });
};
