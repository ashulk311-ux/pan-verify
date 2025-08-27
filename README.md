# PAN KYC Verification System

A secure, scalable web-based PAN KYC verification system built with React and Node.js. This system enables users to upload bulk PAN data via Excel files, automatically verifies PAN details using APIs, and provides a Super Admin module to manage multiple user access and system operations.

## Features

### Core Functionality
- **Bulk PAN Upload**: Upload Excel files containing multiple PAN records
- **Single PAN Verification**: Verify individual PAN numbers
- **Automated Verification**: Real-time PAN verification using external APIs
- **User Management**: Role-based access control with Super Admin capabilities
- **Dashboard**: Comprehensive analytics and reporting
- **Audit Trail**: Complete logging of all operations

### Security Features
- JWT-based authentication
- Role-based access control (RBAC)
- Data encryption at rest and in transit
- Rate limiting and API protection
- Input validation and sanitization
- File upload security

### Technical Stack
- **Frontend**: React.js with Material-UI
- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with Redis for caching
- **File Processing**: Excel.js for bulk uploads
- **Authentication**: JWT tokens
- **API Integration**: Axios for external PAN verification APIs

## Project Structure

```
pan-kyc-system/
├── backend/                 # Node.js backend server
│   ├── src/
│   │   ├── controllers/     # Request handlers
│   │   ├── middleware/      # Custom middleware
│   │   ├── models/          # Database models
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utility functions
│   │   └── config/          # Configuration files
│   ├── uploads/             # File upload directory
│   ├── database/            # Database scripts
│   └── package.json
├── frontend/                # React.js frontend
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API services
│   │   ├── contexts/        # React contexts
│   │   └── utils/           # Utility functions
│   └── package.json
└── README.md
```

## Installation

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- Redis (v6 or higher)

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Configure your environment variables
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
# Configure your environment variables
npm start
```

### Database Setup
```bash
cd backend/database
# Run migrations
psql -U your_username -d your_database -f migrations/001_initial_schema.sql
```

## Environment Variables

### Backend (.env)
```
NODE_ENV=development
PORT=3001
DB_USER=postgres
DB_HOST=localhost
DB_NAME=pan_kyc_db
DB_PASSWORD=password
DB_PORT=5432
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_key
SANDBOX_API_KEY=key_live_6edea225e1354559b2422d3921c795cf
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_ENV=development
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile

### PAN Verification
- `POST /api/pan/upload` - Upload Excel file with PAN data
- `POST /api/pan/verify-single` - Verify single PAN
- `GET /api/pan/verifications` - Get verification history
- `GET /api/pan/verifications/:id` - Get specific verification details

### User Management (Super Admin)
- `GET /api/admin/users` - Get all users
- `POST /api/admin/users` - Create new user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### Dashboard
- `GET /api/admin/dashboard/stats` - Get dashboard statistics
- `GET /api/admin/verifications` - Get all verifications

## Usage

### Default Admin Credentials
- Email: test@example.com
- Password: password123

### User Roles
- **User**: Can upload PAN files and view their own verifications
- **Admin**: Can manage users and view all system data

### File Upload Format
The system accepts Excel files (.xlsx, .xls) and CSV files with the following columns:
- `pan_number` (required): 10-character PAN number
- `name` (required): Full name
- `father_name` (required): Father's name
- `date_of_birth` (required): Date of birth (YYYY-MM-DD format)

## Security Considerations

- All sensitive data is encrypted
- API rate limiting is implemented
- Input validation prevents injection attacks
- Audit logs track all system activities
- Session management with secure tokens
- File upload validation and sanitization

## Development

### Running in Development Mode
```bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm start
```

### Building for Production
```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.
# pan-verify
