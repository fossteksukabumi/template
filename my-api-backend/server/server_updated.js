
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
  console.log('Received data:', { name, price, productLink }); // Log data yang diterima
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  console.log('Image path:', imagePath); // Log image path

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

// Route untuk mendapatkan semua data parts pada e-catalog
app.get('/api/catalog', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM catalog_parts');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching catalog data', err.stack);
    res.status(500).send('Database query error');
  }
});

// Route untuk menambah data part baru ke dalam e-catalog
app.post('/api/catalog', upload.single('image'), async (req, res) => {
  const { name, price, description, link } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = await pool.query(
      'INSERT INTO catalog_parts (name, price, description, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, price, description, imagePath]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting part data', err.stack);
    res.status(500).send('Database query error');
  }
});

// Route untuk mengupdate data part pada e-catalog
app.put('/api/catalog/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, price, description, link } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const query = `
      UPDATE catalog_parts
      SET name = $1, price = $2, description = $3, image_url = $4
      WHERE id = $5
      RETURNING *;
    `;
    const result = await pool.query(query, [name, price, description, imagePath, id]);
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error updating part data', err.stack);
    res.status(500).send('Database query error');
  }
});

// Route untuk menghapus data part dari e-catalog
app.delete('/api/catalog/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const part = await pool.query('SELECT image_url FROM catalog_parts WHERE id = $1', [id]);
    const imagePath = part.rows[0].image_url;

    if (imagePath) {
      fs.unlink(path.join(__dirname, '../', imagePath), (err) => {
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

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
