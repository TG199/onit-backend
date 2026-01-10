    # Server - Backend API

## Overview

This is the backend server for the ONIT project. It provides RESTful API endpoints for the application.

## Tech Stack

- Node.js
- Express.js
- PostgreSQL

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Database (MongoDB/PostgreSQL)

## Installation

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Configure environment variables
# Edit .env with your settings
```

## Environment Variables

```
PORT=5000
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

## Running the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## Project Structure

```
server/
├── config/         # Configuration files
├── controllers/    # Route controllers
├── models/         # Database models
├── routes/         # API routes
├── middleware/     # Custom middleware
├── utils/          # Utility functions
└── server.js       # Entry point
```

## Testing

```bash
npm test
```

## License

MIT
