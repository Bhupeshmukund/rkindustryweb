import request from 'supertest';
import app from '../server.js';
import { db } from '../config/db.js';

// Note: tests mock database methods on the shared `db` object to avoid requiring a live DB.
// These are integration-style tests for the /api/admin/variants/:variantId endpoint.

describe('PUT /api/admin/variants/:variantId - attribute replacement', () => {
  const originalQuery = db.query;
  const originalGetConnection = db.getConnection;

  afterEach(() => {
    // Restore mocks
    db.query = originalQuery;
    db.getConnection = originalGetConnection;
  });

  test('replaces attributes transactionally and returns updated variant', async () => {
    const variantId = 9999;

    // Mock db.query for SELECT id (existing) and final SELECT to return attributes
    db.query = jest.fn((sql, params) => {
      // First call: SELECT id FROM product_variants
      if (sql.includes('SELECT id FROM product_variants')) {
        return Promise.resolve([[{ id: variantId }]]);
      }

      // Final SELECT to return variant + attrs
      if (sql.includes('FROM product_variants pv') && sql.includes('LEFT JOIN variant_attributes')) {
        return Promise.resolve([[
          { variant_id: variantId, sku: 'SKU-9999', price: 500, stock: 10, attr_name: 'Size', attr_value: 'XL' },
          { variant_id: variantId, sku: 'SKU-9999', price: 500, stock: 10, attr_name: 'Color', attr_value: 'Black' }
        ]]);
      }

      // Default
      return Promise.resolve([[]]);
    });

    // Mock connection for transactional operations (delete/insert)
    const mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn().mockResolvedValue()
    };

    db.getConnection = jest.fn().mockResolvedValue(mockConn);

    const payload = {
      sku: 'SKU-9999',
      attributes: { Size: 'XL', Color: 'Black' }
    };

    const res = await request(app)
      .put(`/api/admin/variants/${variantId}`)
      .send(payload)
      .expect(200);

    expect(res.body).toHaveProperty('variant');
    const v = res.body.variant;
    expect(v.variant_id).toBe(variantId);
    expect(v.sku).toBe('SKU-9999');
    expect(v.attributes.Size).toBe('XL');
    expect(v.attributes.Color).toBe('Black');

    // Ensure transaction methods were called
    expect(db.getConnection).toHaveBeenCalled();
    expect(mockConn.beginTransaction).toHaveBeenCalled();
    // Expect delete and inserts were executed through conn.query
    expect(mockConn.query).toHaveBeenCalled();
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });
});
