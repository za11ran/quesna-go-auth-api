// يضيف 6 متاجر حقيقية (مش تجريبية) بحسابات دخول أصحابها ومنتجاتهم — طلب مباشر
// من صاحب المشروع. الصور من Wikimedia Commons (مجانية/مرخّصة لإعادة الاستخدام)
// عبر رابط Special:FilePath الثابت اللي بيحوّل تلقائي لرابط الصورة الحقيقي.
// الاستخدام:  node scripts/seed-vendors-batch1.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const needSsl = /neon\.tech|supabase|render\.com|railway/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needSsl ? { rejectUnauthorized: false } : false,
});

const img = (file) => `https://commons.wikimedia.org/wiki/Special:FilePath/${file}`;

// ---------------------------------------------------------------------------
// مواعيد العمل
// ---------------------------------------------------------------------------
function alwaysOpenHours() {
  const days = {};
  for (const k of ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']) days[k] = { open: '00:00', close: '23:59', closed: false };
  return { json: { always_open: true, days }, textAr: 'مفتوح 24 ساعة', textEn: 'Open 24 hours' };
}
function dailyHours(openT, closeT, textAr, textEn) {
  const days = {};
  for (const k of ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']) days[k] = { open: openT, close: closeT, closed: false };
  return { json: { always_open: false, days }, textAr, textEn };
}

// ---------------------------------------------------------------------------
// بيانات المتاجر
// ---------------------------------------------------------------------------
const VENDORS = [
  {
    id: 'metro-market', name_ar: 'مترو ماركت', name_en: 'Metro Market', type: 'supermarket',
    phone: '01030154664', hours: alwaysOpenHours(),
    owner_name: 'أحمد زهران', owner_email: 'metro@quesna.com', owner_password: '123456',
  },
  {
    id: 'elbarka', name_ar: 'مطعم البركة', name_en: 'Elbarka', type: 'restaurant',
    phone: '0000', hours: dailyHours('12:00', '00:00', 'يوميًا 12:00 م - 12:00 ص', 'Daily 12:00 PM - 12:00 AM'),
    owner_name: 'محمد شلبي', owner_email: 'elbarka@quesna.com', owner_password: '123456',
  },
  {
    id: 'elostora', name_ar: 'مطعم الأسطورة', name_en: 'Elostora', type: 'restaurant',
    phone: '0000', hours: dailyHours('12:00', '04:00', 'يوميًا 12:00 م - 4:00 ص', 'Daily 12:00 PM - 4:00 AM'),
    owner_name: null, owner_email: 'elostora@quesna.com', owner_password: '123456',
  },
  {
    id: 'fire', name_ar: 'مطعم فاير', name_en: 'Fire', type: 'restaurant',
    phone: '0000', hours: dailyHours('14:00', '04:00', 'يوميًا 2:00 م - 4:00 ص', 'Daily 2:00 PM - 4:00 AM'),
    owner_name: null, owner_email: 'fire@quesna.com', owner_password: '123456',
  },
  {
    id: 'medo-pharmacy', name_ar: 'صيدلية ميدو', name_en: 'Medo Pharmacy', type: 'pharmacy',
    phone: '0000', hours: alwaysOpenHours(),
    owner_name: 'د. محمد العزب', owner_email: 'medo@quesna.com', owner_password: '123456',
  },
  {
    id: 'drop-clothing', name_ar: 'دروب للملابس', name_en: 'Drop Clothing', type: 'clothing',
    phone: null, hours: dailyHours('15:00', '00:00', 'يوميًا 3:00 م - 12:00 ص', 'Daily 3:00 PM - 12:00 AM'),
    owner_name: null, owner_email: 'drop@quesna.com', owner_password: '123456',
  },
];

// ---------------------------------------------------------------------------
// أقسام + منتجات كل متجر
// كل قسم: { name_ar, name_en, category (للسوبر ماركت بس، legacy field), items: [[name_ar, name_en, price, image]] }
// ---------------------------------------------------------------------------
const SECTIONS = {
  'metro-market': [
    { name_ar: 'بقالة', name_en: 'Grocery', category: 'grocery', image: img('Supermarket_shelves.jpg'), items: [
      ['أرز مصري 1 كيلو', 'Egyptian Rice 1kg', 35], ['مكرونة اسباجيتي 400 جرام', 'Spaghetti 400g', 18],
      ['زيت عباد الشمس 1.5 لتر', 'Sunflower Oil 1.5L', 85], ['سكر أبيض 1 كيلو', 'White Sugar 1kg', 28],
      ['دقيق فاخر 1 كيلو', 'Premium Flour 1kg', 22], ['عدس أصفر 1 كيلو', 'Yellow Lentils 1kg', 45],
      ['فول مدمس معلب', 'Canned Fava Beans', 15], ['صلصة طماطم 400 جرام', 'Tomato Sauce 400g', 16],
      ['شاي أحمر 100 كيس', 'Black Tea 100 Bags', 55], ['قهوة تركي 200 جرام', 'Turkish Coffee 200g', 65],
      ['ملح طعام 1 كيلو', 'Table Salt 1kg', 8], ['خل أبيض 500 مل', 'White Vinegar 500ml', 12],
      ['عسل نحل طبيعي 500 جرام', 'Natural Honey 500g', 90], ['زيتون أسود 400 جرام', 'Black Olives 400g', 38],
      ['طحينة 400 جرام', 'Tahini 400g', 42], ['مايونيز 400 جرام', 'Mayonnaise 400g', 33],
      ['خل بلسميك', 'Balsamic Vinegar', 48],
    ] },
    { name_ar: 'مشروبات', name_en: 'Beverages', category: 'beverages', image: img('Soft_drinks_800x600.jpg'), items: [
      ['مياه معدنية 1.5 لتر', 'Mineral Water 1.5L', 8], ['كوكاكولا 1 لتر', 'Coca-Cola 1L', 20],
      ['سبرايت 1 لتر', 'Sprite 1L', 20], ['فانتا برتقال 1 لتر', 'Fanta Orange 1L', 20],
      ['عصير مانجو 1 لتر', 'Mango Juice 1L', 25], ['عصير برتقال 1 لتر', 'Orange Juice 1L', 25],
      ['عصير جوافة 1 لتر', 'Guava Juice 1L', 25], ['نسكافيه 200 جرام', 'Nescafe 200g', 110],
      ['شاي مثلج 500 مل', 'Iced Tea 500ml', 15], ['مياه غازية ليمون 1 لتر', 'Lemon Soda 1L', 20],
      ['مشروب طاقة', 'Energy Drink 250ml', 30], ['لبن رايب مشروب 500 مل', 'Drinkable Yogurt 500ml', 18],
      ['حليب صويا 1 لتر', 'Soy Milk 1L', 45], ['ماء صودا 1 لتر', 'Soda Water 1L', 14],
      ['عصير أناناس 1 لتر', 'Pineapple Juice 1L', 25], ['شراب تمر هندي 1 لتر', 'Tamarind Drink 1L', 22],
      ['مياه غازية تفاح', 'Apple Soda 1L', 20],
    ] },
    { name_ar: 'ألبان وأجبان', name_en: 'Dairy & Cheese', category: 'dairyAndCheese', image: img('PCC_Dairy_products.jpg'), items: [
      ['لبن كامل الدسم 1 لتر', 'Full Fat Milk 1L', 32], ['جبنة رومي 250 جرام', 'Roumy Cheese 250g', 75],
      ['جبنة بيضاء طرية 500 جرام', 'Feta Cheese 500g', 60], ['زبادي 170 جرام', 'Yogurt 170g', 8],
      ['زبدة 200 جرام', 'Butter 200g', 55], ['جبنة كريمي 200 جرام', 'Cream Cheese 200g', 40],
      ['جبنة موزاريلا 250 جرام', 'Mozzarella Cheese 250g', 65], ['قشطة 170 جرام', 'Cream 170g', 22],
      ['جبنة قريش 250 جرام', 'Cottage Cheese 250g', 25], ['لبن بودرة 400 جرام', 'Powdered Milk 400g', 95],
      ['آيس كريم فانيليا 1 لتر', 'Vanilla Ice Cream 1L', 70], ['جبنة شيدر 200 جرام', 'Cheddar Cheese 200g', 68],
      ['لبن خالي الدسم 1 لتر', 'Skimmed Milk 1L', 30], ['بيض كرتونة 30 بيضة', 'Eggs Tray 30pcs', 110],
      ['لبن أطفال 400 جرام', 'Baby Formula 400g', 180], ['زبادي يوناني', 'Greek Yogurt 200g', 28],
    ] },
    { name_ar: 'مجمدات', name_en: 'Frozen', category: 'frozen', image: img('Frozen_French_Fries_1.jpg'), items: [
      ['بطاطس مجمدة 1 كيلو', 'Frozen French Fries 1kg', 45], ['فراخ مجمدة 1 كيلو', 'Frozen Whole Chicken 1kg', 95],
      ['برجر لحم 10 قطع', 'Beef Burger 10pcs', 85], ['كبدة مجمدة 500 جرام', 'Frozen Liver 500g', 60],
      ['خضار مشكل مجمد 500 جرام', 'Mixed Frozen Vegetables 500g', 30], ['بازلاء مجمدة 500 جرام', 'Frozen Peas 500g', 25],
      ['ناجتس فراخ 500 جرام', 'Chicken Nuggets 500g', 55], ['سمك بلطي مجمد 1 كيلو', 'Frozen Tilapia 1kg', 80],
      ['جمبري مجمد 500 جرام', 'Frozen Shrimp 500g', 150], ['كفتة مجمدة 500 جرام', 'Frozen Kofta 500g', 70],
      ['آيس كريم شوكولاتة 1 لتر', 'Chocolate Ice Cream 1L', 70], ['فطير مجمد 500 جرام', 'Frozen Pastry 500g', 40],
      ['ذرة مجمدة 500 جرام', 'Frozen Corn 500g', 22], ['سبانخ مجمدة 500 جرام', 'Frozen Spinach 500g', 20],
      ['مشكل بحري مجمد 500 جرام', 'Frozen Seafood Mix 500g', 130], ['سجق مجمد 500 جرام', 'Frozen Sausages 500g', 65],
    ] },
    { name_ar: 'منظفات', name_en: 'Cleaning', category: 'cleaning', image: img('Laundry_detergent_pods.jpg'), items: [
      ['مسحوق غسيل 3 كيلو', 'Laundry Powder 3kg', 120], ['صابون سائل أطباق 750 مل', 'Dish Soap 750ml', 25],
      ['كلوركس 1 لتر', 'Bleach 1L', 18], ['منعم ملابس 1 لتر', 'Fabric Softener 1L', 45],
      ['معطر جو', 'Air Freshener', 30], ['مناديل ورقية', 'Paper Tissues', 15],
      ['مناديل مطبخ', 'Kitchen Paper Rolls', 35], ['كيس قمامة 20 قطعة', 'Garbage Bags 20pcs', 20],
      ['اسفنجة أطباق 5 قطع', 'Dish Sponges 5pcs', 12], ['منظف أرضيات 1 لتر', 'Floor Cleaner 1L', 28],
      ['صابون يدين 500 مل', 'Hand Soap 500ml', 22], ['شامبو 400 مل', 'Shampoo 400ml', 48],
      ['معجون أسنان 100 مل', 'Toothpaste 100ml', 25], ['فرشاة أسنان', 'Toothbrush', 15],
      ['مزيل عرق', 'Deodorant', 40], ['ورق تواليت 10 لفة', 'Toilet Paper 10 rolls', 55],
      ['سائل تعقيم 500 مل', 'Hand Sanitizer 500ml', 35],
    ] },
    { name_ar: 'سناكس وحلويات', name_en: 'Snacks & Sweets', category: 'snacks', image: img('Potato_Chips.jpg'), items: [
      ['شيبسي بالجبنة', 'Cheese Chips', 10], ['بسكويت شاي', 'Tea Biscuits', 12],
      ['شوكولاتة لوز', 'Almond Chocolate', 35], ['نودلز فوري بيتزا', 'Instant Noodles Pizza', 8],
      ['كيك بالشوكولاتة', 'Chocolate Cake Bar', 15], ['مكسرات مشكلة 200 جرام', 'Mixed Nuts 200g', 65],
      ['كورن فليكس 500 جرام', 'Corn Flakes 500g', 55], ['حلاوة طحينية 400 جرام', 'Halawa Tahiniya 400g', 40],
      ['توفي', 'Toffee Bag', 20], ['ويفر بالفانيليا', 'Vanilla Wafers', 14],
      ['فشار', 'Popcorn', 12], ['جيلي حلوى', 'Jelly Candy', 10],
      ['بسكويت محشو بالشوكولاتة', 'Chocolate Sandwich Biscuits', 18], ['رقائق ذرة مملحة', 'Salted Corn Chips', 10],
      ['شوكولاتة بيضاء', 'White Chocolate Bar', 25], ['حمص محمص', 'Roasted Chickpeas', 15],
      ['زبيب مجفف 200 جرام', 'Dried Raisins 200g', 30],
    ] },
  ],
  elbarka: [
    { name_ar: 'فراخ', name_en: 'Chicken', image: img('Grilled_Tandoori_chicken.jpg'), items: [
      ['فرخة مشوية كاملة', 'Whole Grilled Chicken', 180], ['نص فرخة مشوية', 'Half Grilled Chicken', 95],
      ['صدور فراخ مشوية', 'Grilled Chicken Breast', 85], ['أجنحة فراخ مشوية', 'Grilled Chicken Wings', 70],
      ['شيش طاووق', 'Chicken Shish Tawook', 90],
    ] },
    { name_ar: 'مشويات', name_en: 'Grills', image: img('Colors_of_Kebab.JPG'), items: [
      ['كباب لحم', 'Beef Kebab', 130], ['كفتة مشوية', 'Grilled Kofta', 110],
      ['مشاوي مشكلة', 'Mixed Grill Platter', 220], ['ريش ضاني', 'Lamb Chops', 160],
      ['طاجن فراخ بالفرن', 'Baked Chicken Tagine', 100],
    ] },
  ],
  elostora: [
    { name_ar: 'كريبات', name_en: 'Crepes', image: img('Crepes_dsc07085.jpg'), items: [
      ['كريب نوتيلا', 'Nutella Crepe', 55], ['كريب جبنة', 'Cheese Crepe', 45],
      ['كريب دجاج', 'Chicken Crepe', 65], ['كريب فراخ بانيه', 'Chicken Panne Crepe', 70],
      ['كريب ميكس', 'Mixed Crepe', 60],
    ] },
    { name_ar: 'بيتزا', name_en: 'Pizza', image: img('Pepperoni_pizza.jpg'), items: [
      ['بيتزا مارجريتا', 'Margherita Pizza', 90], ['بيتزا خضار', 'Vegetable Pizza', 100],
      ['بيتزا فراخ', 'Chicken Pizza', 120], ['بيتزا سوبريم', 'Supreme Pizza', 135],
      ['بيتزا ببروني', 'Pepperoni Pizza', 110],
    ] },
  ],
  fire: [
    { name_ar: 'فرايد تشيكن', name_en: 'Fried Chicken', image: img('Fried-Chicken-Set.jpg'), items: [
      ['باكيت فرايد تشكن 6 قطع', 'Fried Chicken Bucket 6pcs', 150],
      ['باكيت فرايد تشكن 9 قطع', 'Fried Chicken Bucket 9pcs', 210],
      ['برجر تشكن', 'Chicken Burger', 65], ['سترپس فراخ 5 قطع', 'Chicken Strips 5pcs', 75],
      ['أجنحة فراخ حارة', 'Spicy Chicken Wings', 80], ['وجبة فردية فرايد تشكن', 'Single Fried Chicken Meal', 60],
      ['تويستر تشكن', 'Chicken Twister', 55], ['بوكس فرايد تشكن عائلي', 'Family Fried Chicken Box', 280],
      ['ناجتس فراخ 10 قطع', 'Chicken Nuggets 10pcs', 50], ['لفائف فراخ كرسبي', 'Crispy Chicken Wrap', 58],
    ] },
  ],
  'medo-pharmacy': [
    { name_ar: 'مسكنات', name_en: 'Pain Relief', image: img('Tylenol_rapid_release_pills.jpg'), items: [
      ['باراسيتامول 500 مج', 'Paracetamol 500mg', 12], ['إيبوبروفين 400 مج', 'Ibuprofen 400mg', 18],
      ['مسكن للصداع', 'Headache Relief Tablets', 15], ['شراب سعال للأطفال', 'Kids Cough Syrup', 45],
      ['أقراص التهاب حلق', 'Throat Lozenges', 20],
    ] },
    { name_ar: 'فيتامينات ومكملات', name_en: 'Vitamins & Supplements', image: img('Wyeth_Centrum.jpg'), items: [
      ['فيتامين سي 1000', 'Vitamin C 1000mg', 65], ['فيتامين د3', 'Vitamin D3', 70],
      ['أوميجا 3', 'Omega 3 Capsules', 120], ['مكمل حديد', 'Iron Supplement', 55],
      ['أقراص فيتامين متعدد', 'Multivitamin Tablets', 80],
    ] },
    { name_ar: 'عناية بالبشرة', name_en: 'Skincare', image: img('Equate_lotion.jpg'), items: [
      ['كريم ترطيب', 'Moisturizing Cream', 85], ['غسول وجه', 'Face Wash', 60],
      ['كريم حروق الشمس', 'Sunscreen Cream', 95], ['لوشن للأطفال', 'Baby Lotion', 50],
      ['حفاضات أطفال', 'Baby Diapers Pack', 140],
    ] },
    { name_ar: 'إسعافات أولية', name_en: 'First Aid', image: img('A-first-aid-kit.jpg'), items: [
      ['شاش طبي', 'Medical Gauze', 15], ['بلاستر جروح', 'Wound Plasters', 20],
      ['مطهر جروح', 'Antiseptic Solution', 25], ['ترمومتر رقمي', 'Digital Thermometer', 90],
      ['كمامات طبية 10 قطع', 'Medical Masks 10pcs', 30],
    ] },
  ],
};

// دروب للملابس: بيانات خاصة لأنها محتاجة مقاسات وألوان (product_options)
const CLOTHING_ITEMS = [
  ['تيشيرت قطن أبيض', 'Plain White Cotton T-Shirt', 150, img('Men%27s_long-sleeve_T-shirt.jpg')],
  ['تيشيرت بولو', 'Polo Shirt', 220, img('Men%27s_long-sleeve_T-shirt.jpg')],
  ['قميص كلاسيك', 'Classic Dress Shirt', 280, img('Men%27s_long-sleeve_T-shirt.jpg')],
  ['بنطلون جينز', 'Denim Jeans', 350, img('Jeans.jpg')],
  ['بنطلون قماش', 'Chino Pants', 300, img('Jeans.jpg')],
  ['جاكيت جينز', 'Denim Jacket', 480, img('Denim_jacket.jpg')],
  ['هودي', 'Hoodie', 320, img('Letterman_jacket.jpg')],
  ['تيشيرت مطبوع', 'Printed Graphic T-Shirt', 180, img('Men%27s_long-sleeve_T-shirt.jpg')],
  ['بنطلون رياضي', 'Jogger Pants', 260, img('Jeans.jpg')],
  ['جاكيت شتوي', 'Winter Jacket', 550, img('Letterman_jacket.jpg')],
];
const SIZES = ['S', 'M', 'L', 'XL'];
const COLORS = [['أسود', 'Black'], ['كحلي', 'Navy']];

async function upsertVendor(client, v) {
  await client.query(
    `INSERT INTO vendors (id, name_ar, name_en, type, phone, working_hours, working_hours_text_ar, working_hours_text_en, status, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved',true)
     ON CONFLICT (id) DO UPDATE SET name_ar=EXCLUDED.name_ar, name_en=EXCLUDED.name_en, type=EXCLUDED.type,
       phone=EXCLUDED.phone, working_hours=EXCLUDED.working_hours,
       working_hours_text_ar=EXCLUDED.working_hours_text_ar, working_hours_text_en=EXCLUDED.working_hours_text_en`,
    [v.id, v.name_ar, v.name_en, v.type, v.phone, JSON.stringify(v.hours.json), v.hours.textAr, v.hours.textEn]
  );
  const hash = await bcrypt.hash(v.owner_password, 10);
  await client.query(
    `INSERT INTO staff_users (name, email, phone, password_hash, role, vendor_id)
     VALUES ($1,$2,NULL,$3,'vendor_owner',$4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, vendor_id = EXCLUDED.vendor_id`,
    [v.owner_name || `صاحب ${v.name_ar}`, v.owner_email, hash, v.id]
  );
}

async function insertSection(client, vendorId, section, sortOrder) {
  const { rows } = await client.query(
    `INSERT INTO menu_sections (vendor_id, name_ar, name_en, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
    [vendorId, section.name_ar, section.name_en, sortOrder]
  );
  const sectionId = rows[0].id;
  let i = 0;
  for (const [nameAr, nameEn, price] of section.items) {
    i += 1;
    const productId = `${vendorId}_${sectionId}_${i}`;
    await client.query(
      `INSERT INTO products (id, vendor_id, name_ar, name_en, price, image, category, menu_section_id, stock, is_available, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)
       ON CONFLICT (id) DO NOTHING`,
      [productId, vendorId, nameAr, nameEn, price, section.image, section.category || null, sectionId, 100, i]
    );
  }
}

async function insertClothing(client, vendorId) {
  const { rows } = await client.query(
    `INSERT INTO menu_sections (vendor_id, name_ar, name_en, sort_order) VALUES ($1,'ملابس رجالي','Men''s Wear',1) RETURNING id`,
    [vendorId]
  );
  const sectionId = rows[0].id;
  let i = 0;
  for (const [nameAr, nameEn, price, image] of CLOTHING_ITEMS) {
    i += 1;
    const productId = `${vendorId}_${sectionId}_${i}`;
    await client.query(
      `INSERT INTO products (id, vendor_id, name_ar, name_en, price, image, menu_section_id, stock, is_available, has_options, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true,$9)
       ON CONFLICT (id) DO NOTHING`,
      [productId, vendorId, nameAr, nameEn, price, image, sectionId, 60, i]
    );
    let optSort = 0;
    for (const size of SIZES) {
      for (const [colorAr, colorEn] of COLORS) {
        optSort += 1;
        const optId = `opt${optSort}`;
        await client.query(
          `INSERT INTO product_options (id, product_id, name_ar, name_en, price, stock, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (product_id, id) DO NOTHING`,
          [optId, productId, `${size} - ${colorAr}`, `${size} - ${colorEn}`, price, 15, optSort]
        );
      }
    }
  }
}

(async () => {
  if (!process.env.DATABASE_URL) { console.error('❌ لا يوجد DATABASE_URL'); process.exit(1); }
  const client = await pool.connect();
  try {
    for (const v of VENDORS) {
      await upsertVendor(client, v);
      console.log(`✓ متجر: ${v.name_ar} (${v.id})`);

      // menu_sections.id سيريال (auto)، فمنتجات القسم مربوطة بمعرّف قسم مختلف
      // كل مرة — تشغيل السكريبت تاني كان هيكرر الأقسام والمنتجات. الشيك ده
      // بيخلي التشغيل الثاني (لو حصل بالغلط) آمن: يحدّث بيانات المتجر بس
      // ويسيب المنتجات زي ما هي لو أصلًا موجودة.
      const already = await client.query(`SELECT count(*)::int c FROM products WHERE vendor_id = $1`, [v.id]);
      if (already.rows[0].c > 0) {
        console.log(`  → عنده ${already.rows[0].c} منتج بالفعل، اتخطّينا إضافة منتجات جديدة`);
        continue;
      }

      if (v.id === 'drop-clothing') {
        await insertClothing(client, v.id);
      } else {
        const sections = SECTIONS[v.id] || [];
        let sortOrder = 0;
        for (const section of sections) {
          sortOrder += 1;
          await insertSection(client, v.id, section, sortOrder);
        }
      }
      const count = await client.query(`SELECT count(*)::int c FROM products WHERE vendor_id = $1`, [v.id]);
      console.log(`  → ${count.rows[0].c} منتج`);
    }
    console.log('✅ خلصت.');
  } catch (err) {
    console.error('❌ فشل:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
