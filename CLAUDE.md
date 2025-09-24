# Fulqrom Hub REST API

## Tech Stack
- Node.js, Express.js, MongoDB (Mongoose)

## Commands
```bash
npm install
npm run dev
npm start
```

## Endpoints
- `GET /health` - Health check
- `GET /api/customers` - List customers
- `GET /api/customers/:id` - Get customer

## Database
```
MONGODB_CONNECTION=mongodb+srv://shriramsoft_db_user:nbNKl1V3TpBAQhfo@cluster0.mulczg0.mongodb.net/fulqrom-hub
```

## Validation Strategy
- **Comprehensive API Validation**: All business rules, data integrity, security checks
- **Australian Standards**: ABN (11 digits), ACN (9 digits), postcodes (4 digits)
- **Error Responses**: Clear, actionable error messages with field-specific details
- **Data Sanitization**: Input cleaning and SQL injection prevention