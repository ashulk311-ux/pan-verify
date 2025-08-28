const XLSX = require('xlsx');

// Sample PAN KYC data with different column formats
const sampleDataStandard = [
  {
    pan_number: 'ABCDE1234F',
    name: 'John Doe',
    father_name: 'Robert Doe',
    date_of_birth: '1990-01-15'
  },
  {
    pan_number: 'FGHIJ5678K',
    name: 'Jane Smith',
    father_name: 'Michael Smith',
    date_of_birth: '1985-03-22'
  }
];

const sampleDataFlexible = [
  {
    'PAN No': 'LMNOP9012Q',
    'Name': 'Alice Johnson',
    'Father Name': 'David Johnson',
    'Date of Birth': '1992-07-10'
  },
  {
    'PAN No': 'RSTUV3456W',
    'Name': 'Bob Wilson',
    'Father Name': 'James Wilson',
    'Date of Birth': '1988-11-05'
  }
];

const sampleDataAadhaarPan = [
  {
    'PAN No': 'XYZAB7890C',
    'Name': 'Carol Brown',
    'DOB': '1995-04-18',
    'AADHAAR': '123456789012'
  },
  {
    'PAN No': 'DEFGH1234I',
    'Name': 'David Lee',
    'DOB': '1987-09-25',
    'AADHAAR': '987654321098'
  }
];

// Create workbook with multiple sheets
const workbook = XLSX.utils.book_new();

// Sheet 1: Standard format
const worksheet1 = XLSX.utils.json_to_sheet(sampleDataStandard);
XLSX.utils.book_append_sheet(workbook, worksheet1, 'Standard Format');

// Sheet 2: Flexible format
const worksheet2 = XLSX.utils.json_to_sheet(sampleDataFlexible);
XLSX.utils.book_append_sheet(workbook, worksheet2, 'Flexible Format');

// Sheet 3: Aadhaar-PAN format (will work with PAN KYC)
const worksheet3 = XLSX.utils.json_to_sheet(sampleDataAadhaarPan);
XLSX.utils.book_append_sheet(workbook, worksheet3, 'Aadhaar-PAN Format');

// Write to file
XLSX.writeFile(workbook, 'sample_pan_kyc_flexible.xlsx');

console.log('Sample PAN KYC files created successfully:');
console.log('1. Standard Format: pan_number, name, father_name, date_of_birth');
console.log('2. Flexible Format: PAN No, Name, Father Name, Date of Birth');
console.log('3. Aadhaar-PAN Format: PAN No, Name, DOB, AADHAAR (father_name will be set to "Not Available")');
console.log('\nFile saved as: sample_pan_kyc_flexible.xlsx');
