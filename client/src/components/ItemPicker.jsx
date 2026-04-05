import { useEffect, useMemo, useState, useRef } from 'react';
import { api } from '../api';
import { isOnline } from '../offline';

export default function ItemPicker({ onAdd }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [validationErr, setValidationErr] = useState('');
  const [packaging, setPackaging] = useState('each');
  const [qty, setQty] = useState(1);

  // Searchable dropdown state
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true); setErr('');
        const data = await api.items.list();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.sku?.toLowerCase().includes(q)
    );
  }, [items, search]);

  function selectItem(item) {
    setSelectedItem(item);
    setSearch(item.name);
    setShowDropdown(false);
    // Auto-set packaging based on item's default
    setPackaging(item.packaging || 'each');
  }

  // Check if item can be sold in cases (has multiple units per pack)
  const canSellAsCase = selectedItem && (Number(selectedItem.unitsPerPack) || 1) > 1;

  function clearSelection() {
    setSelectedItem(null);
    setSearch('');
    inputRef.current?.focus();
  }

  function add() {
    setValidationErr('');
    if (!selectedItem) { setValidationErr('Please pick an item'); return; }
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) { setValidationErr('Enter a valid quantity'); return; }

    const p = packaging || selectedItem?.packaging || 'each';
    const unitsPerPack = Number(selectedItem.unitsPerPack) || 1;

    // Validate quantity - decimals only allowed for case packaging with multiple units
    if (p === 'each' && !Number.isInteger(q)) {
      setValidationErr('Quantity must be a whole number');
      return;
    }
    if (p === 'case' && unitsPerPack === 1 && !Number.isInteger(q)) {
      setValidationErr('This item is sold as whole units only');
      return;
    }

    // Calculate unit price based on packaging
    const packPrice = Number(selectedItem.pricePerPack) || 0;
    const unitPrice = p === 'each' ? packPrice / unitsPerPack : packPrice;

    onAdd({
      item: selectedItem._id,
      packaging: p,
      quantity: q,
      unitPrice,
    });

    // reset
    setSelectedItem(null);
    setSearch('');
    setQty(1);
    setPackaging('each');
  }

  return (
    <div className="card" style={{ display:'grid', gap:8 }}>
      <div style={{ fontWeight:600 }}>Add item</div>

      {loading && <div>Loading items...</div>}
      {(!loading && items.length === 0) && (
        <div className="card" style={{ background:'#fffbe6', borderColor:'#ffe58f' }}>
          {isOnline()
            ? 'No items found.'
            : 'No cached items available offline. Open Items once while online to cache them.'}
        </div>
      )}
      {err && <div style={{ color:'red' }}>{err}</div>}
      {validationErr && <div style={{ color:'red', marginBottom: 8 }}>{validationErr}</div>}

      <div className="row responsive-3">
        {/* Searchable Item Dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <label htmlFor="item-search">Item</label>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              id="item-search"
              type="text"
              className="input"
              placeholder="Type to search items..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setSelectedItem(null);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              disabled={items.length === 0}
              autoComplete="off"
              aria-label="Search and select item"
            />
            {selectedItem && (
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  opacity: 0.6,
                  padding: '2px 6px'
                }}
                aria-label="Clear selection"
              >
                ×
              </button>
            )}
          </div>

          {/* Dropdown list */}
          {showDropdown && !selectedItem && items.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              maxHeight: 250,
              overflowY: 'auto',
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 100,
              marginTop: 4
            }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: '12px', opacity: 0.6, textAlign: 'center' }}>
                  No items match "{search}"
                </div>
              ) : (
                filteredItems.map(item => (
                  <div
                    key={item._id}
                    onClick={() => selectItem(item)}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>
                      ${Number(item.pricePerPack || 0).toFixed(2)}/{item.packaging || 'each'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Selected item indicator */}
          {selectedItem && (
            <div style={{ fontSize: 13, color: '#28a745', marginTop: 4 }}>
              Selected: {selectedItem.name} (${Number(selectedItem.pricePerPack || 0).toFixed(2)})
            </div>
          )}
        </div>

        <div>
          <label htmlFor="packaging-select">Packaging</label>
          <select
            id="packaging-select"
            className="input"
            value={packaging}
            onChange={e=>setPackaging(e.target.value)}
            aria-label="Select packaging type"
            disabled={!selectedItem}
          >
            <option value="each">Each (whole units)</option>
            {canSellAsCase && (
              <option value="case">Case ({selectedItem?.unitsPerPack} units)</option>
            )}
          </select>
          {selectedItem && !canSellAsCase && (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              This item is sold individually
            </div>
          )}
        </div>

        <div>
          <label htmlFor="qty-input">Qty</label>
          <input
            id="qty-input"
            className="input"
            type="number"
            step={packaging === 'case' ? '0.01' : '1'}
            min="0"
            value={qty}
            onChange={e=>setQty(e.target.value)}
            aria-label="Quantity"
          />
        </div>
      </div>

      <div>
        <button className="btn" onClick={add} disabled={items.length===0} aria-label="Add item to cart">Add</button>
      </div>
    </div>
  );
}
