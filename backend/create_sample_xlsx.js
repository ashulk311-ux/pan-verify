const XLSX = require('xlsx');

// Sample data for Aadhaar-PAN linking
const data = [
  {
    aadhaar_number: '123456789012',
    pan_number: 'ABCDE1234F',
    name: 'John Doe',
    date_of_birth: '1990-01-15'
  },
  {
    aadhaar_number: '987654321098',
    pan_number: 'FGHIJ5678K',
    name: 'Jane Smith',
    date_of_birth: '1985-05-20'
  },
  {
    aadhaar_number: '456789123456',
    pan_number: 'KLMNO9012P',
    name: 'Bob Johnson',
    date_of_birth: '1992-12-10'
  },
  {
    aadhaar_number: '789123456789',
    pan_number: 'PQRST3456U',
    name: 'Alice Brown',
    date_of_birth: '1988-08-25'
  },
  {
    aadhaar_number: '321654987321',
    pan_number: 'UVWXY7890Z',
    name: 'Charlie Wilson',
    date_of_birth: '1995-03-30'
  }
];

// Create workbook and worksheet
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(data);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Aadhaar-PAN Linking');

// Write to file
XLSX.writeFile(workbook, 'sample_aadhaar_pan_test.xlsx');

console.log('Sample XLSX file created: sample_aadhaar_pan_test.xlsx');
