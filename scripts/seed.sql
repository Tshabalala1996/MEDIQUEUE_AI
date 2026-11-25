-- Seed roles
INSERT IGNORE INTO roles (role_name, description) VALUES
  ('Patient',       'A registered patient who can book appointments'),
  ('Doctor',        'A licensed medical practitioner'),
  ('Receptionist',  'Front-desk staff who manage walk-ins and queues'),
  ('Admin',         'System administrator with full access');

-- Seed specializations
INSERT IGNORE INTO specializations (name, description, typical_consultation_mins) VALUES
  ('General Practice',       'Primary care and general health consultations', 15),
  ('Cardiology',             'Heart and cardiovascular system', 30),
  ('Dermatology',            'Skin, hair and nail conditions', 20),
  ('Gynaecology',            'Female reproductive health', 30),
  ('Orthopaedics',           'Bones, joints and musculoskeletal system', 30),
  ('Paediatrics',            'Medical care for infants, children and adolescents', 20),
  ('Psychiatry',             'Mental health and behavioural disorders', 45),
  ('Radiology',              'Medical imaging and diagnostics', 20),
  ('Surgery',                'Surgical procedures and post-operative care', 30),
  ('Ophthalmology',          'Eye and vision care', 20),
  ('ENT',                    'Ear, nose and throat conditions', 20),
  ('Neurology',              'Brain and nervous system disorders', 30),
  ('Oncology',               'Cancer diagnosis and treatment', 45),
  ('Urology',                'Urinary tract and male reproductive system', 20),
  ('Endocrinology',          'Hormonal and metabolic disorders', 30),
  ('Nephrology',             'Kidney diseases and disorders', 30),
  ('Pulmonology',            'Lung and respiratory conditions', 30),
  ('Rheumatology',           'Joints, muscles and autoimmune diseases', 30),
  ('Gastroenterology',       'Digestive system and gastrointestinal disorders', 30),
  ('Haematology',            'Blood disorders and diseases', 30);

-- Seed common symptoms
INSERT IGNORE INTO symptoms (symptom_name, description, severity_level) VALUES
  ('Headache',            'Pain or discomfort in the head or neck region', 2),
  ('Fever',               'Elevated body temperature above 37.5°C', 3),
  ('Cough',               'Sudden expulsion of air from the lungs', 2),
  ('Shortness of breath', 'Difficulty breathing or feeling breathless', 4),
  ('Chest pain',          'Pain, pressure or tightness in the chest', 5),
  ('Nausea',              'Feeling of unease and discomfort in the stomach', 2),
  ('Vomiting',            'Forceful expulsion of stomach contents', 3),
  ('Diarrhoea',           'Loose or watery stools occurring frequently', 3),
  ('Fatigue',             'Persistent tiredness or lack of energy', 2),
  ('Dizziness',           'Sensation of spinning or loss of balance', 3),
  ('Abdominal pain',      'Pain or cramping in the stomach area', 3),
  ('Back pain',           'Pain in the upper, middle or lower back', 2),
  ('Sore throat',         'Pain or irritation in the throat', 2),
  ('Runny nose',          'Excess discharge of mucus from the nose', 1),
  ('Rash',                'Area of irritated or swollen skin', 2),
  ('Joint pain',          'Pain or aching in one or more joints', 3),
  ('Muscle pain',         'Aching or soreness in muscles', 2),
  ('Loss of appetite',    'Reduced desire to eat', 2),
  ('Weight loss',         'Unintentional decrease in body weight', 3),
  ('Night sweats',        'Excessive sweating during sleep', 2);

-- Seed hospitals (Public & Private across all 9 SA provinces)
INSERT IGNORE INTO hospitals (name, facility_type, province, city, address_line1, phone, email, rating_avg, is_active) VALUES
  -- Gauteng — Public
  ('Charlotte Maxeke Johannesburg Academic Hospital', 'Public', 'Gauteng', 'Johannesburg', 'Jubilee Road, Parktown, Johannesburg, 2193', '011 488 3911', 'info@cmjah.co.za', 3.8, 1),
  ('Chris Hani Baragwanath Academic Hospital',        'Public', 'Gauteng', 'Soweto',        '26 Chris Hani Road, Diepkloof, Soweto, 1864',        '011 933 8000', 'info@chbah.co.za', 3.9, 1),
  ('Steve Biko Academic Hospital',                    'Public', 'Gauteng', 'Pretoria',      'Steve Biko Road, Arcadia, Pretoria, 0002',           '012 354 1000', 'info@sbah.co.za',  3.7, 1),
  -- Gauteng — Private
  ('Netcare Milpark Hospital',            'Private', 'Gauteng', 'Johannesburg', '9 Guild Road, Parktown West, Johannesburg, 2041', '011 480 5600', 'milpark@netcare.co.za',  4.3, 1),
  ('Life Flora Hospital',                 'Private', 'Gauteng', 'Johannesburg', 'Corner Ontdekkers & Hazelwood Roads, Florida, 1709', '011 975 8000', 'flora@lifehealthcare.co.za', 4.2, 1),
  ('Mediclinic Morningside',              'Private', 'Gauteng', 'Sandton',      'Rivonia Road, Morningside Manor, Sandton, 2057',   '011 282 5000', 'morningside@mediclinic.co.za', 4.5, 1),
  ('Netcare Sunninghill Hospital',        'Private', 'Gauteng', 'Sandton',      '16 Witkoppen Road, Sunninghill, Sandton, 2157',    '011 806 1500', 'sunninghill@netcare.co.za', 4.4, 1),
  ('Life Wilgers Hospital',               'Private', 'Gauteng', 'Pretoria',     '60 Wilhelm Leuschner Street, The Willows, Pretoria, 0184', '012 807 8100', 'wilgers@lifehealthcare.co.za', 4.3, 1),
  -- Western Cape — Public
  ('Groote Schuur Hospital',              'Public',  'Western Cape', 'Cape Town',     'Main Road, Observatory, Cape Town, 7925',             '021 404 9111', 'info@gsh.co.za',  4.1, 1),
  ('Tygerberg Hospital',                  'Public',  'Western Cape', 'Bellville',     'Francie van Zijl Drive, Tygerberg, Bellville, 7505',   '021 938 4911', 'info@tbh.co.za',  3.8, 1),
  -- Western Cape — Private
  ('Netcare Christiaan Barnard Memorial', 'Private', 'Western Cape', 'Cape Town',     '181 Longmarket Street, Cape Town CBD, 8001',          '021 480 6111', 'cbm@netcare.co.za', 4.6, 1),
  ('Life Vincent Pallotti Hospital',      'Private', 'Western Cape', 'Cape Town',     'Alexandra Road, Pinelands, Cape Town, 7405',          '021 506 5111', 'vincent@lifehealthcare.co.za', 4.4, 1),
  -- KwaZulu-Natal — Public
  ('King Edward VIII Hospital',           'Public',  'KwaZulu-Natal', 'Durban',       'Umbilo Road, Congella, Durban, 4001',                 '031 360 3111', 'info@keh.co.za',  3.6, 1),
  ('Inkosi Albert Luthuli Central Hospital','Public', 'KwaZulu-Natal', 'Durban',      '800 Bellair Road, Mayville, Durban, 4058',            '031 240 1000', 'info@ialch.co.za', 4.0, 1),
  -- KwaZulu-Natal — Private
  ('Netcare St Augustine''s Hospital',    'Private', 'KwaZulu-Natal', 'Durban',       '107 Chelmsford Road, Glenwood, Durban, 4001',         '031 268 5000', 'staugs@netcare.co.za', 4.5, 1),
  ('Life Entabeni Hospital',              'Private', 'KwaZulu-Natal', 'Durban',       '148 Mazisi Kunene Road, Berea, Durban, 4001',         '031 204 1300', 'entabeni@lifehealthcare.co.za', 4.3, 1),
  -- Eastern Cape — Public
  ('Frere Hospital',                      'Public',  'Eastern Cape',  'East London',  'Amalinda Main Road, East London, 5200',               '043 709 2111', 'info@frere.co.za', 3.5, 1),
  -- Eastern Cape — Private
  ('Mediclinic Beacon Bay',               'Private', 'Eastern Cape',  'East London',  '1 Bonza Bay Road, Beacon Bay, East London, 5241',     '043 702 8000', 'beaconbay@mediclinic.co.za', 4.2, 1),
  -- Limpopo — Public
  ('Polokwane Provincial Hospital',       'Public',  'Limpopo',       'Polokwane',    'Dorp Street, Polokwane, 0699',                        '015 287 5000', 'info@polprov.co.za', 3.4, 1),
  -- Limpopo — Private
  ('Life Tzaneen Private Hospital',       'Private', 'Limpopo',       'Tzaneen',      'Agatha Street, Tzaneen, 0850',                        '015 307 3000', 'tzaneen@lifehealthcare.co.za', 4.1, 1),
  -- Mpumalanga — Public
  ('Rob Ferreira Hospital',               'Public',  'Mpumalanga',    'Nelspruit',    'Ferreira Street, Nelspruit, 1200',                    '013 741 5000', 'info@rfh.co.za',  3.5, 1),
  -- Mpumalanga — Private
  ('Mediclinic Nelspruit',                'Private', 'Mpumalanga',    'Nelspruit',    'Louis Trichardt Street, Nelspruit, 1200',             '013 759 0500', 'nelspruit@mediclinic.co.za', 4.3, 1),
  -- North West — Public
  ('Klerksdorp Hospital',                 'Public',  'North West',    'Klerksdorp',   'Leask Street, Klerksdorp, 2570',                      '018 406 4000', 'info@klerksdorp.co.za', 3.3, 1),
  -- North West — Private
  ('Life Anncron Hospital',               'Private', 'North West',    'Klerksdorp',   '72 Annan Road, Klerksdorp, 2571',                     '018 462 2302', 'anncron@lifehealthcare.co.za', 4.0, 1),
  -- Free State — Public
  ('Pelonomi Regional Hospital',          'Public',  'Free State',    'Bloemfontein', 'Hlokoma Avenue, Pelonomi, Bloemfontein, 9300',        '051 405 1911', 'info@pelonomi.co.za', 3.6, 1),
  -- Free State — Private
  ('Mediclinic Bloemfontein',             'Private', 'Free State',    'Bloemfontein', '12 Pasteur Road, Universitas, Bloemfontein, 9301',    '051 404 6666', 'bloem@mediclinic.co.za', 4.4, 1),
  -- Northern Cape — Public
  ('Kimberley Hospital Complex',          'Public',  'Northern Cape', 'Kimberley',    'Du Toitspan Road, Kimberley, 8300',                   '053 802 9111', 'info@khc.co.za',  3.4, 1),
  -- Northern Cape — Private
  ('Life Gariep Private Hospital',        'Private', 'Northern Cape', 'Kimberley',    'Hulley Road, Royldene, Kimberley, 8301',              '053 807 8900', 'gariep@lifehealthcare.co.za', 4.1, 1);

-- Seed clinics (GP & Community across provinces)
INSERT IGNORE INTO clinics (name, clinic_type, province, city, address_line1, phone, email, rating_avg, is_active) VALUES
  ('Johannesburg Community Health Centre',   'Community',   'Gauteng',       'Johannesburg', '1 Joubert Street, Newtown, Johannesburg, 2000', '011 376 1200', 'jchc@health.gpg.gov.za',     3.6, 1),
  ('Tembisa Community Health Centre',        'Community',   'Gauteng',       'Tembisa',      'Oakmoor Road, Tembisa, 1632',                   '011 923 2000', 'tembisa@health.gpg.gov.za',  3.5, 1),
  ('Dr. City GP Practice',                   'GP',          'Gauteng',       'Johannesburg', '25 Rissik Street, Marshalltown, Johannesburg, 2001', '011 834 7000', 'info@drcity.co.za',    4.2, 1),
  ('Cape Town City Health Clinic',           'Community',   'Western Cape',  'Cape Town',    '33 Buitenkant Street, Cape Town CBD, 8000',     '021 465 9500', 'cityhealth@capetown.gov.za', 3.7, 1),
  ('Durban South Beach Community Clinic',    'Community',   'KwaZulu-Natal', 'Durban',       '15 Marine Parade, South Beach, Durban, 4001',   '031 311 7000', 'southbeach@durban.gov.za',   3.5, 1),
  ('Medicross Cresta',                       'GP',          'Gauteng',       'Johannesburg', 'Cresta Shopping Centre, Beyers Naude Drive, Johannesburg, 2194', '011 678 5200', 'cresta@medicross.co.za', 4.4, 1),
  ('Medicross Menlyn',                       'GP',          'Gauteng',       'Pretoria',     'Menlyn Maine, Amarand Avenue, Pretoria, 0181',  '012 348 3300', 'menlyn@medicross.co.za',     4.3, 1),
  ('Polokwane Wellness Clinic',              'GP',          'Limpopo',       'Polokwane',    '14 Biccard Street, Polokwane, 0699',            '015 291 4100', 'wellness@polokwane.co.za',   4.0, 1);
