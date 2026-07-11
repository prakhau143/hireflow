// Master list of locations (Indian cities + Remote/Hybrid options)
// Popular locations shown first, then complete list for search

export const POPULAR_LOCATIONS = [
  'Remote',
  'Hybrid',
  'Bangalore',
  'Hyderabad',
  'Pune',
  'Delhi',
  'Noida',
  'Mumbai',
  'Chennai',
  'Gurugram',
]

export const ALL_LOCATIONS = Array.from(new Set([
  // Work type
  'Remote',
  'Hybrid',
  'On-site',
  'Work from Home',

  // Metro Cities
  'Delhi',
  'Mumbai',
  'Bangalore',
  'Chennai',
  'Kolkata',
  'Hyderabad',
  'Pune',
  'Ahmedabad',

  // NCR
  'Noida',
  'Gurugram',
  'Ghaziabad',
  'Faridabad',
  'Greater Noida',

  // Karnataka
  'Bangalore',
  'Mysore',
  'Hubli',
  'Mangalore',
  'Belgaum',
  'Davanagere',
  'Bellary',
  'Vijayapura',
  'Shimoga',
  'Tumkur',

  // Telangana
  'Hyderabad',
  'Warangal',
  'Nizamabad',
  'Khammam',
  'Karimnagar',
  'Ramagundam',
  'Mahbubnagar',

  // Andhra Pradesh
  'Visakhapatnam',
  'Vijayawada',
  'Guntur',
  'Nellore',
  'Kurnool',
  'Rajahmundry',
  'Tirupati',
  'Kakinada',
  'Anantapur',

  // Tamil Nadu
  'Chennai',
  'Coimbatore',
  'Madurai',
  'Tiruchirappalli',
  'Salem',
  'Erode',
  'Tirunelveli',
  'Vellore',
  'Thoothukudi',
  'Dindigul',
  'Thanjavur',
  'Nagercoil',

  // Maharashtra
  'Mumbai',
  'Pune',
  'Nagpur',
  'Nashik',
  'Aurangabad',
  'Solapur',
  'Kolhapur',
  'Amravati',
  'Thane',
  'Pimpri-Chinchwad',
  'Navi Mumbai',
  'Malegaon',

  // Gujarat
  'Ahmedabad',
  'Surat',
  'Vadodara',
  'Rajkot',
  'Bhavnagar',
  'Jamnagar',
  'Junagadh',
  'Gandhinagar',

  // Uttar Pradesh
  'Lucknow',
  'Kanpur',
  'Agra',
  'Varanasi',
  'Meerut',
  'Allahabad',
  'Ghaziabad',
  'Bareilly',
  'Aligarh',
  'Moradabad',
  'Saharanpur',
  'Gorakhpur',

  // West Bengal
  'Kolkata',
  'Howrah',
  'Durgapur',
  'Asansol',
  'Siliguri',
  'Bardhaman',
  'Malda',
  'Kharagpur',
  'Baharampur',

  // Rajasthan
  'Jaipur',
  'Jodhpur',
  'Udaipur',
  'Kota',
  'Bikaner',
  'Ajmer',
  'Bhilwara',
  'Alwar',

  // Kerala
  'Kochi',
  'Thiruvananthapuram',
  'Kozhikode',
  'Kollam',
  'Thrissur',
  'Palakkad',
  'Kannur',
  'Kottayam',

  // Madhya Pradesh
  'Indore',
  'Bhopal',
  'Jabalpur',
  'Gwalior',
  'Ujjain',
  'Sagar',
  'Dewas',
  'Satna',

  // Odisha
  'Bhubaneswar',
  'Cuttack',
  'Rourkela',
  'Berhampur',
  'Sambalpur',
  'Puri',

  // Punjab
  'Ludhiana',
  'Amritsar',
  'Jalandhar',
  'Patiala',
  'Bathinda',
  'Mohali',

  // Haryana
  'Gurugram',
  'Faridabad',
  'Panipat',
  'Ambala',
  'Karnal',
  'Rohtak',
  'Hisar',

  // Bihar
  'Patna',
  'Gaya',
  'Bhagalpur',
  'Muzaffarpur',
  'Purnia',
  'Darbhanga',

  // Jharkhand
  'Ranchi',
  'Jamshedpur',
  'Dhanbad',
  'Bokaro',
  'Deoghar',

  // Chhattisgarh
  'Raipur',
  'Bhilai',
  'Korba',
  'Bilaspur',
  'Durg',

  // Assam
  'Guwahati',
  'Dibrugarh',
  'Silchar',
  'Jorhat',
  'Nagaon',

  // Uttarakhand
  'Dehradun',
  'Haridwar',
  'Roorkee',
  'Haldwani',
  'Kashipur',

  // Himachal Pradesh
  'Shimla',
  'Dharamshala',
  'Solan',
  'Mandi',
  'Kullu',

  // Jammu & Kashmir
  'Srinagar',
  'Jammu',
  'Anantnag',

  // Goa
  'Panaji',
  'Margao',
  'Vasco da Gama',

  // Union Territories
  'Chandigarh',
  'Puducherry',
  'New Delhi',

  // Other major cities
  'Coimbatore',
  'Madurai',
  'Visakhapatnam',
  'Vijayawada',
  'Nagpur',
  'Nashik',
  'Vadodara',
  'Lucknow',
  'Kanpur',
  'Jaipur',
  'Surat',
  'Indore',
  'Bhopal',
  'Patna',
  'Ranchi',
  'Raipur',
  'Guwahati',
  'Dehradun',
  'Chandigarh',
]))

export function isLocationInMasterList(location: string): boolean {
  return ALL_LOCATIONS.includes(location)
}
