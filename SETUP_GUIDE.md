# PAN KYC System Setup Guide

## Quick Start

### Option 1: Using Docker (Recommended)
```bash
# Clone the repository
git clone <repository-url>
cd pan-kyc-system

# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
```

### Option 2: Manual Setup
```bash
# 1. Install dependencies
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# 2. Set up database
# Create PostgreSQL database
createdb pan_kyc_db

# Run migrations
psql -U postgres -d pan_kyc_db -f backend/database/migrations/001_initial_schema.sql

# 3. Start Redis
redis-server

# 4. Start backend
cd backend
npm run dev

# 5. Start frontend
cd ../frontend
npm start
```

## Default Credentials
- **Email**: test@example.com
- **Password**: password123

## Features Overview

### User Features
1. **Dashboard**: View verification statistics
2. **Bulk Upload**: Upload Excel files with PAN data
3. **Single Verification**: Verify individual PAN numbers
4. **History**: View all verification attempts

### Admin Features
1. **User Management**: Create, edit, and delete users
2. **System Dashboard**: View system-wide statistics
3. **All Verifications**: Monitor all verification activities
4. **Role Management**: Assign admin/user roles

## File Upload Format

Create an Excel file with these columns:
- `pan_number`: 10-character PAN number (e.g., ABCDE1234F)
- `name`: Full name of the person
- `father_name`: Father's name
- `date_of_birth`: Date in YYYY-MM-DD format

## API Integration

To integrate with Sandbox.co.in PAN verification API:
1. Get your API key from https://sandbox.co.in
2. Add your API key to `SANDBOX_API_KEY` in backend `.env` (format: `key_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
3. The system will automatically use the sandbox.co.in API endpoint

## Security Notes

1. Change default JWT secret in production
2. Use strong database passwords
3. Enable HTTPS in production
4. Configure proper CORS settings
5. Set up proper firewall rules

## Troubleshooting

### Common Issues
1. **Database Connection**: Ensure PostgreSQL is running
2. **Redis Connection**: Ensure Redis is running
3. **File Upload**: Check uploads directory permissions
4. **CORS Issues**: Verify frontend URL in backend CORS config

### Logs
- Backend logs: Check console output
- Frontend logs: Check browser console
- Database logs: Check PostgreSQL logs

## Support

For issues and questions:
1. Check the README.md file
2. Review the API documentation
3. Check the console logs
4. Verify environment variables
