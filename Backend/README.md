# Backend Server Setup

## Prerequisites
- Node.js installed
- MySQL database running
- Database named "rkindustrys" created

## Database Configuration
Update `config/db.js` with your MySQL credentials:
- host: localhost (or your MySQL host)
- user: root (or your MySQL user)
- password: "" (your MySQL password)
- database: rkindustrys

## Installation
```bash
npm install
```

## Start Server
```bash
node server.js
```

Or use the batch file:
```bash
start.bat
```

The server will run on http://localhost:5000

## API Endpoints
- Public APIs: /api/public/*
- Admin APIs: /api/admin/*

