"""
India States and Cities Data

Provides location data for the custom job form.
States and major cities for dropdown selection.
"""

INDIA_STATES = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry",
]

INDIA_CITIES = {
    "Andhra Pradesh": [
        "Amaravati", "Visakhapatnam", "Vijayawada", "Guntur", "Nellore",
        "Kurnool", "Kakinada", "Tirupati", "Rajahmundry", "Kadapa"
    ],
    "Arunachal Pradesh": [
        "Itanagar", "Naharlagun", "Pasighat", "Tezpur", "Bomdila"
    ],
    "Assam": [
        "Guwahati", "Dispur", "Silchar", "Dibrugarh", "Jorhat",
        "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon", "Karimganj"
    ],
    "Bihar": [
        "Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Purnia",
        "Darbhanga", "Ara", "Begusarai", "Katihar", "Sasaram"
    ],
    "Chhattisgarh": [
        "Raipur", "Bilaspur", "Durg", "Korba", "Rajnandgaon",
        "Raigarh", "Jagdalpur", "Ambikapur", "Dhamtari", "Chirmiri"
    ],
    "Goa": [
        "Panaji", "Vasco da Gama", "Margao", "Mapusa", "Ponda"
    ],
    "Gujarat": [
        "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar",
        "Jamnagar", "Junagadh", "Gandhinagar", "Anand", "Bhuj"
    ],
    "Haryana": [
        "Chandigarh", "Gurgaon", "Faridabad", "Panipat", "Ambala",
        "Karnal", "Hisar", "Rohtak", "Sonipat", "Yamunanagar"
    ],
    "Himachal Pradesh": [
        "Shimla", "Dharamshala", "Solan", "Mandi", "Palampur",
        "Kullu", "Manali", "Chamba", "Hamirpur", "Nahan"
    ],
    "Jharkhand": [
        "Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar",
        "Hazaribagh", "Giridih", "Dumka", "Chaibasa", "Ramgarh"
    ],
    "Karnataka": [
        "Bangalore", "Mysore", "Hubli", "Mangalore", "Belgaum",
        "Gulbarga", "Davanagere", "Bellary", "Vijayapura", "Shimoga"
    ],
    "Kerala": [
        "Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam",
        "Palakkad", "Alappuzha", "Kannur", "Kottayam", "Malappuram"
    ],
    "Madhya Pradesh": [
        "Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain",
        "Sagar", "Dewas", "Satna", "Ratlam", "Rewa"
    ],
    "Maharashtra": [
        "Mumbai", "Pune", "Nagpur", "Thane", "Pimpri-Chinchwad",
        "Nashik", "Kalyan-Dombivli", "Vasai-Virar", "Aurangabad", "Navi Mumbai"
    ],
    "Manipur": [
        "Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Kakching"
    ],
    "Meghalaya": [
        "Shillong", "Tura", "Cherrapunji", "Jowai", "Baghmara"
    ],
    "Mizoram": [
        "Aizawl", "Lunglei", "Saiha", "Champhai", "Kolasib"
    ],
    "Nagaland": [
        "Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha"
    ],
    "Odisha": [
        "Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur",
        "Puri", "Angul", "Jharsuguda", "Baripada", "Balasore"
    ],
    "Punjab": [
        "Chandigarh", "Ludhiana", "Amritsar", "Jalandhar", "Patiala",
        "Bathinda", "Mohali", "Firozpur", "Pathankot", "Hoshiarpur"
    ],
    "Rajasthan": [
        "Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer",
        "Bikaner", "Alwar", "Bhilwara", "Sikar", "Pali"
    ],
    "Sikkim": [
        "Gangtok", "Namchi", "Geyzing", "Pelling", "Jorethang"
    ],
    "Tamil Nadu": [
        "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem",
        "Erode", "Tiruppur", "Vellore", "Thoothukudi", "Dindigul"
    ],
    "Telangana": [
        "Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar",
        "Ramagundam", "Mahbubnagar", "Nalgonda", "Adilabad", "Miryalaguda"
    ],
    "Tripura": [
        "Agartala", "Dharmanagar", "Udaipur", "Kailasahar", "Belonia"
    ],
    "Uttar Pradesh": [
        "Lucknow", "Kanpur", "Agra", "Varanasi", "Meerut",
        "Allahabad", "Ghaziabad", "Noida", "Bareilly", "Aligarh"
    ],
    "Uttarakhand": [
        "Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rishikesh",
        "Kashipur", "Rudrapur", "Kotdwar", "Mussoorie", "Nainital"
    ],
    "West Bengal": [
        "Kolkata", "Asansol", "Siliguri", "Durgapur", "Bardhaman",
        "Malda", "Baharampur", "Kharagpur", "Shantipur", "Dankuni"
    ],
    "Andaman and Nicobar Islands": [
        "Port Blair", "Car Nicobar", "Havelock Island", "Neil Island", "Rangat"
    ],
    "Chandigarh": [
        "Chandigarh"
    ],
    "Dadra and Nagar Haveli and Daman and Diu": [
        "Daman", "Diu", "Silvassa", "Vapi", "Dadra"
    ],
    "Delhi": [
        "New Delhi", "Delhi", "Noida", "Gurgaon", "Faridabad"
    ],
    "Jammu and Kashmir": [
        "Srinagar", "Jammu", "Anantnag", "Baramulla", "Sopore"
    ],
    "Ladakh": [
        "Leh", "Kargil"
    ],
    "Lakshadweep": [
        "Kavaratti", "Agatti", "Minicoy", "Andrott", "Kalpeni"
    ],
    "Puducherry": [
        "Pondicherry", "Karaikal", "Yanam", "Mahe"
    ],
}


def get_states() -> list[str]:
    """Get list of all Indian states and union territories."""
    return INDIA_STATES


def get_cities(state: str) -> list[str]:
    """Get list of cities for a given state."""
    return INDIA_CITIES.get(state, [])


def get_all_locations() -> dict:
    """Get complete state-to-cities mapping."""
    return INDIA_CITIES
