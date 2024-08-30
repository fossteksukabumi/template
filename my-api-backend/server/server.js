const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');

const app = express();

const pool = new Pool({
  user: 'my_user',
  host: 'localhost',
  database: 'my_database',
  password: '7Elevent',
  port: 5432,
});

app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; font-src 'self' http://localhost:3002 data:; img-src 'self' http://localhost:3002 data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self';"
  );
  next();
});

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

app.get('/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching data', err.stack);
    res.status(500).send('Database query error');
  }
});

app.post('/products', upload.single('image'), async (req, res) => {
  const { name, price, productLink } = req.body;
  console.log('Received data:', { name, price, productLink });
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  console.log('Image path:', imagePath);

  try {
    const result = await pool.query(
      'INSERT INTO products (name, price, "productLink", image) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, price, productLink, imagePath]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting data', err.stack);
    res.status(500).send('Database query error');
  }
});

app.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const product = await pool.query('SELECT image FROM products WHERE id = $1', [id]);
    const imagePath = product.rows[0].image;

    if (imagePath) {
      fs.unlink(path.join(__dirname, '../', imagePath), (err) => {
        if (err) console.error('Error deleting image file', err);
      });
    }

    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.status(200).send('Product deleted');
  } catch (err) {
    console.error('Error deleting product', err.stack);
    res.status(500).send('Database query error');
  }
});

// Route to get all parts in the e-catalog
app.get('/api/catalog', async (req, res) => {
  const { name, price, order, brand, category } = req.query;
  let query = 'SELECT * FROM catalog_parts';
  const values = [];
  let conditions = [];

  if (name) {
    conditions.push(`LOWER(name) LIKE LOWER($${conditions.length + 1})`);
    values.push(`%${name}%`);
  }

  if (brand) {
    conditions.push(`LOWER(brand) = LOWER($${conditions.length + 1})`);
    values.push(brand);
  }

  if (category) {
    conditions.push(`LOWER(category) = LOWER($${conditions.length + 1})`);
    values.push(category);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const orderClauses = [];

  if (price === 'low-to-high') {
    orderClauses.push('CAST(price AS DECIMAL) ASC');
  } else if (price === 'high-to-low') {
    orderClauses.push('CAST(price AS DECIMAL) DESC');
  }

  if (order === 'asc') {
    orderClauses.push('name ASC');
  } else if (order === 'desc') {
    orderClauses.push('name DESC');
  }

  if (orderClauses.length > 0) {
    query += ' ORDER BY ' + orderClauses.join(', ');
  }

  try {
    const result = await pool.query(query, values);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching catalog data', err.stack);
    res.status(500).send('Database query error');
  }
});

app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  try {
    const query = 'INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)';
    await pool.query(query, [name, email, message]);
    res.status(201).send('Message saved successfully');
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).send('Error saving message');
  }
});

app.get('/api/contact/messages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).send('Error fetching messages');
  }
});

// Route to add a new part to the e-catalog
app.post('/api/catalog', upload.single('image'), async (req, res) => {
  const { name, price, description, link, brand, category } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = await pool.query(
      'INSERT INTO catalog_parts (name, price, description, link, brand, category, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, price, description, link, brand, category, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting part data', err.stack);
    res.status(500).send('Database query error');
  }
});

// Route to update an existing part in the e-catalog
app.put('/api/catalog/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, price, description, link, brand, category } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const query = `
      UPDATE catalog_parts
      SET name = $1, price = $2, description = $3, link = $4, brand = $5, category = $6, image_url = $7
      WHERE id = $8
      RETURNING *;
    `;
    const result = await pool.query(query, [name, price, description, link, brand, category, image_url, id]);
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error updating part data', err.stack);
    res.status(500).send('Database query error');
  }
});

// Route to delete a part from the e-catalog
app.delete('/api/catalog/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const part = await pool.query('SELECT image_url FROM catalog_parts WHERE id = $1', [id]);
    const image_url = part.rows[0].image_url;

    if (image_url) {
      fs.unlink(path.join(__dirname, '../', image_url), (err) => {
        if (err) console.error('Error deleting image file', err);
      });
    }

    await pool.query('DELETE FROM catalog_parts WHERE id = $1', [id]);
    res.status(200).send('Part deleted');
  } catch (err) {
    console.error('Error deleting part', err.stack);
    res.status(500).send('Database query error');
  }
});

// Endpoint untuk mendapatkan semua brand
app.get('/api/catalog/brands', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT brand FROM catalog_parts');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).send('Server error');
  }
});

// Endpoint untuk mendapatkan semua kategori
app.get('/api/catalog/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM catalog_parts');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).send('Server error');
  }
});

// Other routes...

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
