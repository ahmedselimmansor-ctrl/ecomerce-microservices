/**
 * خريطة التنقّل: الأقسام الرئيسية وقوائمها المنسدلة.
 *
 * <p>ثابتة في الكود لا مجلوبة من الـ API عمدًا: شجرة التنقّل تتغيّر مرات
 * قليلة في السنة، وجلبها عند كل طلب يضيف رحلة شبكة على المسار الحرج لكل
 * صفحة. الأقسام الفعلية للمنتجات تأتي من catalog-service.
 */

export interface MegaColumn {
  title: string;
  links: { label: string; slug: string }[];
}

export interface NavCategory {
  label: string;
  labelAr: string;
  slug: string;
  columns: MegaColumn[];
  brands: string[];
  /** صورة ترويجية على يمين القائمة. */
  promo: { image: string; href: string };
}

const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=70`;

export const NAV: NavCategory[] = [
  {
    label: 'Electronics',
    labelAr: 'إلكترونيات',
    slug: 'electronics',
    columns: [
      {
        title: 'MOBILES & ACCESSORIES',
        links: [
          { label: 'iPhones', slug: 'mobiles' },
          { label: 'Budget Smartphones', slug: 'mobiles' },
          { label: 'Tablets', slug: 'tablets' },
          { label: 'Headsets & Speakers', slug: 'audio' },
          { label: 'Wearables', slug: 'wearables' },
          { label: 'Power Banks', slug: 'accessories' },
          { label: 'Chargers', slug: 'accessories' },
        ],
      },
      {
        title: 'LAPTOPS & ACCESSORIES',
        links: [
          { label: 'MacBooks', slug: 'laptops' },
          { label: 'Gaming Laptops', slug: 'laptops' },
          { label: 'Monitors', slug: 'monitors' },
          { label: 'Printers', slug: 'printers' },
          { label: 'Storage Devices', slug: 'accessories' },
          { label: 'Input Devices', slug: 'accessories' },
        ],
      },
      {
        title: 'GAMING ESSENTIALS',
        links: [
          { label: 'Gaming Consoles', slug: 'gaming' },
          { label: 'Gaming Accessories', slug: 'gaming' },
          { label: 'Video Games', slug: 'gaming' },
          { label: 'Gaming Monitors', slug: 'monitors' },
          { label: 'Digital Cards', slug: 'gaming' },
        ],
      },
      {
        title: 'TVS & HOME ENTERTAINMENT',
        links: [
          { label: 'LED', slug: 'tv' },
          { label: 'QLED', slug: 'tv' },
          { label: 'OLED', slug: 'tv' },
          { label: '4K', slug: 'tv' },
          { label: 'Projectors', slug: 'tv' },
          { label: 'Soundbars', slug: 'audio' },
          { label: 'Streaming Devices', slug: 'tv' },
        ],
      },
      {
        title: 'CAMERAS',
        links: [
          { label: 'Action Cameras', slug: 'cameras' },
          { label: 'DSLR Cameras', slug: 'cameras' },
          { label: 'Surveillance Cameras', slug: 'cameras' },
          { label: 'Instant Cameras', slug: 'cameras' },
          { label: 'Camera Accessories', slug: 'cameras' },
        ],
      },
    ],
    brands: ['Apple', 'SAMSUNG', 'xiaomi', 'OPPO', 'HUAWEI', 'Canon', 'DELL', 'hp', 'HONOR', 'Infinix'],
    promo: { image: img('photo-1593359677879-a4bb92f829d1'), href: '/category/tv' },
  },
  {
    label: "Women's Fashion",
    labelAr: 'أزياء نسائية',
    slug: 'womens-fashion',
    columns: [
      {
        title: 'CLOTHING',
        links: [
          { label: 'Tops', slug: 'womens-fashion' },
          { label: 'Dresses', slug: 'womens-fashion' },
          { label: 'Pants', slug: 'womens-fashion' },
          { label: 'Head Scarves', slug: 'womens-fashion' },
          { label: 'Jeans', slug: 'womens-fashion' },
          { label: 'Bodysuits', slug: 'womens-fashion' },
        ],
      },
      {
        title: 'SPORTSWEAR',
        links: [
          { label: 'Tops', slug: 'womens-fashion' },
          { label: 'Leggings', slug: 'womens-fashion' },
          { label: 'Shorts', slug: 'womens-fashion' },
          { label: 'Sport Bras', slug: 'womens-fashion' },
          { label: 'Sport Shoes', slug: 'shoes' },
          { label: 'Sneakers', slug: 'shoes' },
        ],
      },
      {
        title: 'FOOTWEAR',
        links: [
          { label: 'Sports Shoes', slug: 'shoes' },
          { label: 'Sneakers', slug: 'shoes' },
          { label: 'Sandals', slug: 'shoes' },
          { label: 'Heels', slug: 'shoes' },
          { label: 'Flats', slug: 'shoes' },
          { label: 'Boots', slug: 'shoes' },
          { label: 'Flip Flops', slug: 'shoes' },
        ],
      },
      {
        title: 'BAGS & ACCESSORIES',
        links: [
          { label: 'Totes', slug: 'bags' },
          { label: 'Shoulder Bags', slug: 'bags' },
          { label: 'Cross-body Bags', slug: 'bags' },
          { label: 'Wallets', slug: 'bags' },
          { label: 'Jewelry', slug: 'accessories' },
          { label: 'Eyewear', slug: 'accessories' },
          { label: 'Watches', slug: 'watches' },
        ],
      },
    ],
    brands: ['DeFacto', 'trendyol', 'LC Waikiki', 'adidas', 'SKECHERS', 'AMERICAN EAGLE', 'MM', 'PUMA', 'dejavu', 'Desigual'],
    promo: { image: img('photo-1483985988355-763728e1935b'), href: '/category/womens-fashion' },
  },
  {
    label: "Men's Fashion",
    labelAr: 'أزياء رجالية',
    slug: 'mens-fashion',
    columns: [
      {
        title: 'CLOTHING',
        links: [
          { label: 'Shirts', slug: 'mens-fashion' },
          { label: 'Polos', slug: 'mens-fashion' },
          { label: 'Pants', slug: 'mens-fashion' },
          { label: 'Jeans', slug: 'mens-fashion' },
          { label: 'Sportswear', slug: 'mens-fashion' },
        ],
      },
      {
        title: 'SPORTSWEAR',
        links: [
          { label: 'Tops', slug: 'mens-fashion' },
          { label: 'Jackets', slug: 'mens-fashion' },
          { label: 'Bottoms', slug: 'mens-fashion' },
          { label: 'Sport Shoes', slug: 'shoes' },
          { label: 'Sneakers', slug: 'shoes' },
          { label: 'Track Pants', slug: 'mens-fashion' },
        ],
      },
      {
        title: 'FOOTWEAR',
        links: [
          { label: 'Sports Shoes', slug: 'shoes' },
          { label: 'Sneakers', slug: 'shoes' },
          { label: 'Football Shoes', slug: 'shoes' },
          { label: 'Boots', slug: 'shoes' },
          { label: 'Flip Flops', slug: 'shoes' },
          { label: 'Slides', slug: 'shoes' },
        ],
      },
      {
        title: 'BAGS',
        links: [
          { label: 'Backpacks', slug: 'bags' },
          { label: 'Wallets', slug: 'bags' },
          { label: 'Luggage', slug: 'bags' },
          { label: 'Jewelry', slug: 'accessories' },
          { label: 'Belts', slug: 'accessories' },
          { label: 'Watches', slug: 'watches' },
          { label: 'Eyewear', slug: 'accessories' },
        ],
      },
    ],
    brands: ['AMERICAN EAGLE', 'adidas', 'DeFacto', 'COTTONIL', 'SKECHERS', 'PUMA', 'ANTA', 'trendyol', 'ACTIV', 'LC Waikiki'],
    promo: { image: img('photo-1571019613454-1cb2f99b2d8b'), href: '/category/mens-fashion' },
  },
  {
    label: "Kids' Fashion",
    labelAr: 'أزياء أطفال',
    slug: 'kids-fashion',
    columns: [
      {
        title: 'GIRLS CLOTHING',
        links: [
          { label: 'Tops', slug: 'kids-fashion' },
          { label: 'Pants', slug: 'kids-fashion' },
          { label: 'Clothing Sets', slug: 'kids-fashion' },
          { label: 'Dresses', slug: 'kids-fashion' },
          { label: 'Sportswear', slug: 'kids-fashion' },
          { label: 'Jackets & Outerwear', slug: 'kids-fashion' },
        ],
      },
      {
        title: 'BOYS CLOTHING',
        links: [
          { label: 'Tops', slug: 'kids-fashion' },
          { label: 'Pants', slug: 'kids-fashion' },
          { label: 'Clothing Sets', slug: 'kids-fashion' },
          { label: 'Sweaters', slug: 'kids-fashion' },
          { label: 'Sportswear', slug: 'kids-fashion' },
          { label: 'Jackets & Outerwear', slug: 'kids-fashion' },
        ],
      },
      {
        title: 'KIDS FASHION',
        links: [
          { label: 'Footwear', slug: 'shoes' },
          { label: 'Sports Shoes', slug: 'shoes' },
          { label: 'Sneakers', slug: 'shoes' },
          { label: 'Accessories', slug: 'accessories' },
          { label: 'Backpacks', slug: 'bags' },
        ],
      },
    ],
    brands: ['DeFacto', 'junior', 'Juli Mint', 'adidas', 'LC Waikiki', 'CAESAR', 'NIKE', 'SKECHERS', 'okaïdi'],
    promo: { image: img('photo-1519238263530-99bdd11df2ea'), href: '/category/kids-fashion' },
  },
  {
    label: 'Beauty & Fragrance',
    labelAr: 'الجمال والعطور',
    slug: 'beauty',
    columns: [
      {
        title: 'MAKEUP',
        links: [
          { label: 'Mascaras', slug: 'beauty' },
          { label: 'Foundations', slug: 'beauty' },
          { label: 'Blushers and Bronzers', slug: 'beauty' },
          { label: 'Eyeshadow', slug: 'beauty' },
          { label: 'Lip Glosses', slug: 'beauty' },
          { label: 'Makeup Brushes', slug: 'beauty' },
          { label: 'Makeup Removers', slug: 'beauty' },
          { label: 'Concealer', slug: 'beauty' },
        ],
      },
      {
        title: 'SKINCARE',
        links: [
          { label: 'Moisturizers', slug: 'beauty' },
          { label: 'Suncare', slug: 'beauty' },
          { label: 'Bath & Body', slug: 'beauty' },
          { label: 'Cleansers', slug: 'beauty' },
          { label: 'Toners', slug: 'beauty' },
          { label: 'Treatments & Serums', slug: 'beauty' },
          { label: 'Eye Serums & Creams', slug: 'beauty' },
        ],
      },
      {
        title: 'HAIRCARE',
        links: [
          { label: 'Shampoos', slug: 'beauty' },
          { label: 'Conditioners', slug: 'beauty' },
          { label: 'Hair Masks', slug: 'beauty' },
          { label: 'Hair Oils & Serums', slug: 'beauty' },
          { label: 'Hair Color', slug: 'beauty' },
          { label: 'Professional Range', slug: 'beauty' },
          { label: 'Hair Accessories', slug: 'beauty' },
        ],
      },
      {
        title: 'PERSONAL CARE',
        links: [
          { label: 'Bath & Body', slug: 'beauty' },
          { label: 'Oral Care', slug: 'beauty' },
          { label: 'Roll-ons & Deos', slug: 'beauty' },
          { label: 'Feminine Care', slug: 'beauty' },
          { label: 'Face Wash', slug: 'beauty' },
          { label: 'Lip Care', slug: 'beauty' },
        ],
      },
      {
        title: 'FRAGRANCE',
        links: [
          { label: "Women's Fragrances", slug: 'beauty' },
          { label: "Men's Fragrances", slug: 'beauty' },
          { label: 'Body Mists & Sprays', slug: 'beauty' },
        ],
      },
    ],
    brands: ['SHAAN', 'SHEGLAM', 'Raw African', 'BRAUN', 'VGR', 'soulandmore', 'EVA', 'dermactive', 'KIKO', 'PHILIPS'],
    promo: { image: img('photo-1596462502278-27bfdc403348'), href: '/category/beauty' },
  },
  {
    label: 'Home & Appliances',
    labelAr: 'المنزل والأجهزة',
    slug: 'home',
    columns: [
      {
        title: 'KITCHEN & DINING',
        links: [
          { label: 'Cookware', slug: 'home' },
          { label: 'Storage & Organisation', slug: 'home' },
          { label: 'Dinnerware & Serveware', slug: 'home' },
          { label: 'Kitchen Accessories', slug: 'home' },
          { label: 'Flatware & Cutlery', slug: 'home' },
          { label: 'Bakeware', slug: 'home' },
          { label: 'Drinkware', slug: 'home' },
        ],
      },
      {
        title: 'FURNITURE',
        links: [
          { label: 'Coffee Tables & Side Tables', slug: 'home' },
          { label: 'Gaming Chairs', slug: 'home' },
          { label: 'Bean Bags', slug: 'home' },
          { label: 'Home Office Furniture', slug: 'home' },
          { label: 'TV & Media Units', slug: 'home' },
          { label: 'Mattresses', slug: 'home' },
          { label: 'Sofas & Couches', slug: 'home' },
        ],
      },
      {
        title: 'TOOLS & HOME IMPROVEMENT',
        links: [
          { label: 'Power Tools', slug: 'home' },
          { label: 'Hand Tools', slug: 'home' },
          { label: 'Cleaning Supplies', slug: 'home' },
          { label: 'Home Organisation', slug: 'home' },
          { label: 'Laundry Care', slug: 'home' },
          { label: 'Safety & Security', slug: 'home' },
          { label: 'Electrical & Lighting', slug: 'home' },
        ],
      },
      {
        title: 'HOME DECOR',
        links: [
          { label: 'Lighting', slug: 'home' },
          { label: 'Mats & Carpets', slug: 'home' },
          { label: 'Vases', slug: 'home' },
          { label: 'Mirrors', slug: 'home' },
          { label: 'Clocks', slug: 'home' },
          { label: 'Decor Accents', slug: 'home' },
        ],
      },
      {
        title: 'SMALL APPLIANCES',
        links: [
          { label: 'Air Fryers', slug: 'appliances' },
          { label: 'Coffee Makers', slug: 'appliances' },
          { label: 'Ovens & Toasters', slug: 'appliances' },
          { label: 'Irons & Steamers', slug: 'appliances' },
          { label: 'Blenders', slug: 'appliances' },
          { label: 'Vacuums', slug: 'appliances' },
          { label: 'Electric Kettles', slug: 'appliances' },
        ],
      },
      {
        title: 'LARGE APPLIANCES',
        links: [
          { label: 'Refrigerators & Freezers', slug: 'appliances' },
          { label: 'Washing Machines & Dryers', slug: 'appliances' },
          { label: 'Air Conditioners', slug: 'appliances' },
          { label: 'Cooking Ranges', slug: 'appliances' },
          { label: 'Dishwashers', slug: 'appliances' },
          { label: 'Water Dispensers', slug: 'appliances' },
          { label: 'Fans', slug: 'appliances' },
        ],
      },
    ],
    brands: ['BOSCH', 'TRUEVAL', 'CLUC', 'Pasabahce', 'PHILIPS', 'vileda', 'Snooze', 'BLACK+DECKER', 'ENGLANDER', 'TOSHIBA'],
    promo: { image: img('photo-1522708323590-d24dbb6b0267'), href: '/category/home' },
  },
  {
    label: 'Baby',
    labelAr: 'مستلزمات الأطفال',
    slug: 'baby',
    columns: [
      {
        title: 'BABY ESSENTIALS',
        links: [
          { label: 'Diaper Necessities', slug: 'baby' },
          { label: 'Skin & Bath Care', slug: 'baby' },
          { label: 'Nursing & Feeding', slug: 'baby' },
          { label: 'Car Seats & Strollers', slug: 'baby' },
          { label: 'Baby Clothing', slug: 'baby' },
          { label: 'Safety Equipment', slug: 'baby' },
        ],
      },
      {
        title: 'FEEDING ESSENTIALS',
        links: [
          { label: 'Breast Pumps', slug: 'baby' },
          { label: 'Feeding Bottles', slug: 'baby' },
          { label: 'Pacifiers & Teethers', slug: 'baby' },
          { label: 'Highchairs & Boosters', slug: 'baby' },
          { label: 'Baby Food', slug: 'baby' },
        ],
      },
      {
        title: 'BABY CARE',
        links: [
          { label: 'Diapers', slug: 'baby' },
          { label: 'Wipes', slug: 'baby' },
          { label: 'Diaper Bags', slug: 'baby' },
          { label: 'Hair & Body Care', slug: 'baby' },
          { label: 'Potty Training', slug: 'baby' },
        ],
      },
      {
        title: 'BABY TRAVEL GEAR',
        links: [
          { label: 'Strollers', slug: 'baby' },
          { label: 'Car Seats', slug: 'baby' },
          { label: 'Travel Systems', slug: 'baby' },
          { label: 'Carrier and Slings', slug: 'baby' },
        ],
      },
    ],
    brands: ['molfix', 'Fine Baby', 'chicco', 'PHILIPS AVENT', 'SUPER KiDS', 'PENDULINE', 'Petit Bébé', 'mastela', 'sanosan', 'Joie'],
    promo: { image: img('photo-1519689680058-324335c77eba'), href: '/category/baby' },
  },
  {
    label: 'Toys & Games',
    labelAr: 'ألعاب',
    slug: 'toys',
    columns: [
      {
        title: 'TOYS & GAMES',
        links: [
          { label: 'Toys for Girls', slug: 'toys' },
          { label: 'Toys for Boys', slug: 'toys' },
          { label: 'Party Supplies', slug: 'toys' },
          { label: 'Dressing Up Costumes', slug: 'toys' },
          { label: 'Novelty Toys', slug: 'toys' },
          { label: 'Baby & Toddler Toys', slug: 'toys' },
        ],
      },
      {
        title: 'OUTDOOR PLAY',
        links: [
          { label: 'Pools & Water Play', slug: 'toys' },
          { label: 'Blasters & Foam Play', slug: 'toys' },
          { label: 'Play Tents & Tunnels', slug: 'toys' },
          { label: "Kids' Scooters", slug: 'toys' },
          { label: 'Remote Control Toys', slug: 'toys' },
        ],
      },
      {
        title: 'INDOOR TOYS',
        links: [
          { label: 'Puzzles', slug: 'toys' },
          { label: 'Card & Board Games', slug: 'toys' },
          { label: 'Educational Toys', slug: 'toys' },
          { label: 'Arts & Crafts', slug: 'toys' },
          { label: 'Dolls & Accessories', slug: 'toys' },
          { label: 'Building Toys', slug: 'toys' },
          { label: 'Stuffed & Plush Toys', slug: 'toys' },
        ],
      },
    ],
    brands: ['nilco', 'LEGO', 'Bestway', 'INTEX', 'L.O.L', 'XiuWoo', 'SMART', 'Barbie'],
    promo: { image: img('photo-1558877385-81a1c7e67d72'), href: '/category/toys' },
  },
  {
    label: 'Supermarket',
    labelAr: 'السوبر ماركت',
    slug: 'supermarket',
    columns: [
      {
        title: 'HOME CARE & CLEANING',
        links: [
          { label: 'Household Cleaners', slug: 'supermarket' },
          { label: 'Laundry Care', slug: 'supermarket' },
          { label: 'Air Fresheners', slug: 'supermarket' },
          { label: 'Paper, Elastic & Wraps', slug: 'supermarket' },
        ],
      },
      {
        title: 'BEVERAGES',
        links: [
          { label: 'Tea', slug: 'supermarket' },
          { label: 'Coffee', slug: 'supermarket' },
          { label: 'Soft Drinks', slug: 'supermarket' },
          { label: 'Energy Drinks', slug: 'supermarket' },
          { label: 'Juices', slug: 'supermarket' },
          { label: 'Water', slug: 'supermarket' },
        ],
      },
      {
        title: 'CANNED & PACKAGED',
        links: [
          { label: 'Oils & Ghee', slug: 'supermarket' },
          { label: 'Canned & Jarred Food', slug: 'supermarket' },
          { label: 'Condiments & Sauces', slug: 'supermarket' },
          { label: 'Pasta & Noodles', slug: 'supermarket' },
          { label: 'Pickles & Olives', slug: 'supermarket' },
        ],
      },
      {
        title: 'SNACK FOOD',
        links: [
          { label: 'Chips & Crisps', slug: 'supermarket' },
          { label: 'Nuts & Seeds', slug: 'supermarket' },
          { label: 'Dried Fruits', slug: 'supermarket' },
          { label: 'Biscuits', slug: 'supermarket' },
          { label: 'Chocolate', slug: 'supermarket' },
          { label: 'Candy', slug: 'supermarket' },
        ],
      },
      {
        title: 'BREAKFAST FOOD',
        links: [
          { label: 'Jams & Jellies', slug: 'supermarket' },
          { label: 'Oats', slug: 'supermarket' },
          { label: 'Cereal', slug: 'supermarket' },
          { label: 'Dairy, Cheese & Eggs', slug: 'supermarket' },
          { label: 'Breads & Bakery', slug: 'supermarket' },
        ],
      },
    ],
    brands: ['Persil', 'Lipton', 'Al Doha', 'OXi', 'Juhayna', 'familia', 'Abu Auf', 'white', 'Pital'],
    promo: { image: img('photo-1542838132-92c53300491e'), href: '/category/supermarket' },
  },
  {
    label: 'Automotive',
    labelAr: 'السيارات',
    slug: 'automotive',
    columns: [
      {
        title: 'OILS & FLUIDS',
        links: [
          { label: 'Engine Oils', slug: 'automotive' },
          { label: 'Transmission Oils', slug: 'automotive' },
          { label: 'Fuel System Cleaner', slug: 'automotive' },
          { label: 'Brake Fluids', slug: 'automotive' },
          { label: 'Octane Booster', slug: 'automotive' },
          { label: 'Coolants', slug: 'automotive' },
        ],
      },
      {
        title: 'INTERIOR ACCESSORIES',
        links: [
          { label: 'Consoles & Organizers', slug: 'automotive' },
          { label: 'Car Chargers', slug: 'automotive' },
          { label: 'Seat Covers', slug: 'automotive' },
          { label: 'Air Fresheners', slug: 'automotive' },
          { label: 'Floor Mats', slug: 'automotive' },
          { label: 'Repair Tools', slug: 'automotive' },
          { label: 'Tyres', slug: 'automotive' },
        ],
      },
      {
        title: 'EXTERIOR ACCESSORIES',
        links: [
          { label: 'Decals & Bumper Stickers', slug: 'automotive' },
          { label: 'Lights & Lighting', slug: 'automotive' },
          { label: 'Towing & Winching', slug: 'automotive' },
          { label: 'Full Car Covers', slug: 'automotive' },
          { label: 'Safety', slug: 'automotive' },
        ],
      },
      {
        title: 'CAR CARE',
        links: [
          { label: 'Tools & Equipment', slug: 'automotive' },
          { label: 'Exterior Care', slug: 'automotive' },
          { label: 'Interior Care', slug: 'automotive' },
          { label: 'Finishing', slug: 'automotive' },
          { label: 'Tyre Inflators', slug: 'automotive' },
        ],
      },
      {
        title: 'CAR ELECTRONICS',
        links: [
          { label: 'Car Video', slug: 'automotive' },
          { label: 'Car Audio', slug: 'automotive' },
          { label: 'Dash Cameras', slug: 'automotive' },
          { label: 'Vehicle GPS', slug: 'automotive' },
        ],
      },
    ],
    brands: ['TotalEnergies', 'Shell', 'elf', 'PETRONAS', 'Mobil', 'BOSCH', 'Hankook', 'PIRELLI', 'Pioneer'],
    promo: { image: img('photo-1486262715619-67b85e0b08d3'), href: '/category/automotive' },
  },
  {
    label: 'Health & Nutrition',
    labelAr: 'الصحة والتغذية',
    slug: 'health',
    columns: [
      {
        title: 'VITAMINS AND SUPPLEMENTS',
        links: [
          { label: 'Hair, Skin & Nails', slug: 'health' },
          { label: 'Multivitamins', slug: 'health' },
          { label: 'Sports Supplements', slug: 'health' },
        ],
      },
      {
        title: 'SEXUAL WELLNESS',
        links: [
          { label: 'Family Planning', slug: 'health' },
          { label: 'Lubricants', slug: 'health' },
        ],
      },
      {
        title: 'HEALTH MONITORS',
        links: [
          { label: 'Body Scale Monitors', slug: 'health' },
          { label: 'Thermometers', slug: 'health' },
          { label: 'Blood Glucose Monitors', slug: 'health' },
          { label: 'Heart Rate Monitors', slug: 'health' },
        ],
      },
      {
        title: 'MASSAGE & RELAXATION',
        links: [
          { label: 'Massage Guns', slug: 'health' },
          { label: 'Massage Oils', slug: 'health' },
          { label: 'Massage Rollers', slug: 'health' },
          { label: 'Hot Water Bags', slug: 'health' },
        ],
      },
    ],
    brands: ['Centrum', 'durex', 'RED REX', 'now', 'LIMITLESS', 'fine', 'Fresh Buzz'],
    promo: { image: img('photo-1584017911766-d451b3d0e843'), href: '/category/health' },
  },
  {
    label: 'Sports & Outdoors',
    labelAr: 'الرياضة',
    slug: 'sports',
    columns: [
      {
        title: 'EXERCISE & FITNESS',
        links: [
          { label: 'Accessories', slug: 'sports' },
          { label: 'Running & Training', slug: 'sports' },
          { label: 'Fitness & Strength Training', slug: 'sports' },
          { label: 'Exercise Machines', slug: 'sports' },
          { label: 'Cardio Machines', slug: 'sports' },
          { label: 'Yoga', slug: 'sports' },
          { label: 'Water Sports', slug: 'sports' },
        ],
      },
      {
        title: 'TEAM SPORTS',
        links: [
          { label: 'Football', slug: 'sports' },
          { label: 'Basketball', slug: 'sports' },
          { label: 'Baseball', slug: 'sports' },
          { label: 'Volleyball', slug: 'sports' },
          { label: 'Handball', slug: 'sports' },
          { label: 'Boxing', slug: 'sports' },
        ],
      },
      {
        title: 'RACKET SPORTS',
        links: [
          { label: 'Tennis', slug: 'sports' },
          { label: 'Table Tennis', slug: 'sports' },
          { label: 'Squash', slug: 'sports' },
          { label: 'Padel', slug: 'sports' },
        ],
      },
      {
        title: 'CYCLING',
        links: [
          { label: 'Accessories', slug: 'sports' },
          { label: 'Protective Gear', slug: 'sports' },
          { label: 'Bikes', slug: 'sports' },
        ],
      },
      {
        title: 'SKATES & SCOOTERS',
        links: [
          { label: 'Scooters', slug: 'sports' },
          { label: 'Inline & Roller Skating', slug: 'sports' },
          { label: 'Skateboarding', slug: 'sports' },
          { label: 'Protective Gear', slug: 'sports' },
        ],
      },
    ],
    brands: ['adidas', 'Babolat', 'BODY SCULPTURE', 'COUGAR', 'DECATHLON', 'SPORTQ'],
    promo: { image: img('photo-1517836357463-d25dfeac3438'), href: '/category/sports' },
  },
  {
    label: 'Stationery & Books',
    labelAr: 'القرطاسية والكتب',
    slug: 'stationery',
    columns: [
      {
        title: 'PAPER',
        links: [
          { label: 'Notebooks', slug: 'stationery' },
          { label: 'Card Stock', slug: 'stationery' },
          { label: 'Sticky Notes', slug: 'stationery' },
          { label: 'Copy & Multipurpose Paper', slug: 'stationery' },
          { label: 'Calendars & Planners', slug: 'stationery' },
        ],
      },
      {
        title: 'EDUCATION & CRAFTS',
        links: [
          { label: 'Arts & Crafts Supplies', slug: 'stationery' },
          { label: 'Adhesives', slug: 'stationery' },
          { label: 'Social Studies Material', slug: 'stationery' },
        ],
      },
      {
        title: 'DESK ACCESSORIES',
        links: [
          { label: 'Pencil Cases', slug: 'stationery' },
          { label: 'Pencil Holders', slug: 'stationery' },
          { label: 'Card Files & Holders', slug: 'stationery' },
          { label: 'Desk Supplies', slug: 'stationery' },
        ],
      },
      {
        title: 'WRITING SUPPLIES',
        links: [
          { label: 'Pens & Refills', slug: 'stationery' },
          { label: 'Pencils', slug: 'stationery' },
          { label: 'Markers & Highlighters', slug: 'stationery' },
          { label: 'Erasers & Correction', slug: 'stationery' },
          { label: 'Pencil Sharpeners', slug: 'stationery' },
        ],
      },
      {
        title: 'OFFICE ELECTRONICS',
        links: [
          { label: 'Printer Accessories', slug: 'printers' },
          { label: 'Printers', slug: 'printers' },
          { label: 'Calculators', slug: 'stationery' },
          { label: 'Telephones', slug: 'stationery' },
          { label: 'Cash Registers', slug: 'stationery' },
        ],
      },
      {
        title: 'BOOKS',
        links: [
          { label: "Children's & young adults", slug: 'books' },
          { label: 'Business & finance', slug: 'books' },
          { label: 'Educational books', slug: 'books' },
          { label: 'Fiction', slug: 'books' },
          { label: 'Health & lifestyle', slug: 'books' },
          { label: 'Biographies & memoirs', slug: 'books' },
        ],
      },
    ],
    brands: ['CASIO', 'FABER CASTELL', 'STAEDTLER', 'M&G', 'deli', 'OKA', 'STABILO', 'Panasonic', 'ROTRING', 'uni-ball'],
    promo: { image: img('photo-1519389950473-47ba0277781c'), href: '/category/stationery' },
  },
];

/** الدوائر أسفل الـ hero. */
export const QUICK_LINKS = [
  { label: 'Automotive', labelAr: 'السيارات', href: '/category/automotive', image: img('photo-1486262715619-67b85e0b08d3') },
  { label: 'Back To School', labelAr: 'العودة للمدارس', href: '/category/stationery', image: img('photo-1503676260728-1c00da094a0b') },
  { label: 'Summer Store', labelAr: 'متجر الصيف', href: '/category/beauty', image: img('photo-1507525428034-b723cf961d3e') },
  { label: 'Installments', labelAr: 'التقسيط', href: '/category/electronics', image: img('photo-1556742049-0cfed4f6a45d') },
  { label: 'Travel Store', labelAr: 'متجر السفر', href: '/category/bags', image: img('photo-1553531384-cc64ac80f931') },
  { label: 'Beauty', labelAr: 'الجمال', href: '/category/beauty', image: img('photo-1596462502278-27bfdc403348') },
  { label: "Men's Fashion", labelAr: 'أزياء رجالية', href: '/category/mens-fashion', image: img('photo-1571019613454-1cb2f99b2d8b') },
  { label: "Women's Fashion", labelAr: 'أزياء نسائية', href: '/category/womens-fashion', image: img('photo-1483985988355-763728e1935b') },
  { label: "Kids' Fashion", labelAr: 'أزياء أطفال', href: '/category/kids-fashion', image: img('photo-1519238263530-99bdd11df2ea') },
  { label: 'Bestsellers', labelAr: 'الأكثر مبيعًا', href: '/search?sort=rating', image: img('photo-1556909212-d5b604d0c90d') },
  { label: 'Home & Kitchen', labelAr: 'المنزل والمطبخ', href: '/category/home', image: img('photo-1522708323590-d24dbb6b0267') },
  { label: 'Mobiles', labelAr: 'الهواتف', href: '/category/mobiles', image: img('photo-1592750475338-74b7b21085ab') },
];

/** شبكة العلامات في أسفل الصفحة الرئيسية. */
export const FAVOURITE_BRANDS = [
  'Nintendo', 'MOTUL', 'trendyol', 'TotalEnergies', 'Tefal', 'TOP CHEF', 'Oriental Weavers',
  'Canon', 'COUGAR', 'DeFacto', 'KINGSMITH', 'Snooze', 'Tank', 'CLUC',
  'Rush Brush', 'adidas', 'NIKE', 'ricrac', 'BergHOFF', 'vileda', 'Juhayna',
  'momcozy', 'RED REX', 'sanosan', 'kidilo', 'Haier', 'vivo', 'HONOR',
  'Kérastase', 'Apple', 'LEGO', 'rossmax', 'ELARABY', 'UGREEN', 'HUAWEI',
  'StarVille', 'SONY', 'nilco', 'BOSCH', 'LG', 'SAMSUNG', 'DJI',
];

/** عمليات البحث الشائعة أسفل الصفحة. */
export const POPULAR_SEARCHES = [
  'Body Mist', 'S25 Ultra', 'Samsung S25', 'Dyson', 'Sunscreen', 'Vitamin C Serum',
  'Self Tanner', 'Travel Luggage', 'Aldo Bags', 'Cosmetics', 'iPhone 17 Price',
  'iPhone 17 Pro', 'Tablet', 'iPhone 17 Air', 'iPhone 17 Pro Max', 'iPhone 17 Series',
  'Barbie', 'Lattafa Perfume', 'Rasasi Perfume', 'Versace Perfume', 'Chanel Perfume',
  'Dior Perfume', 'Nothing Phone', 'Best Laptops', 'Sunglasses Men', 'Flip flops',
  'Birkenstock', 'Handbags', 'Sunglasses Women', 'LG Fridge', 'Samsung Fridge',
  'Whirlpool Fridge', 'Ninja Air Fryer', 'Philips Air Fryer', 'Squishmallows',
  'Monopoly', 'Lego', 'MacBook Air', 'MacBook Pro', 'Samsung S24', 'iPhone 16',
  'Samsung S23 Ultra', 'iPhone 16 Plus', 'iPhone 16 Pro', 'ASUS', 'Huawei', 'Apple',
  'Acer Laptops', 'MacBook', 'Gaming Laptop', 'Dell',
];

/** أعمدة الفوتر. */
export const FOOTER_COLUMNS = [
  {
    title: 'Electronics',
    links: ['Mobiles', 'Tablets', 'Laptops', 'Home Appliances', 'Camera, Photo & Video',
      'Televisions', 'Headphones', 'Video Games'],
    slug: 'electronics',
  },
  {
    title: 'Fashion',
    links: ["Women's Fashion", "Men's Fashion", "Girls' Fashion", "Boys' Fashion",
      "Men's Watches", "Women's Watches", 'Eyewear', 'Bags & Luggage'],
    slug: 'womens-fashion',
  },
  {
    title: 'Home and Kitchen',
    links: ['Kitchen & Dining', 'Bedding', 'Bath', 'Home Decor', 'Home Appliances',
      'Tools & Home Improvement', 'Patio, Lawn & Garden', 'Home Storage'],
    slug: 'home',
  },
  {
    title: 'Beauty',
    links: ["Women's Fragrance", "Men's Fragrance", 'Make-up', 'Haircare', 'Skincare',
      'Personal Care', 'Tools & Accessories'],
    slug: 'beauty',
  },
  {
    title: 'Kids, Baby & Toys',
    links: ['Strollers & Prams', 'Car Seats', 'Baby Clothing', 'Feeding',
      'Bathing & Skincare', 'Diapering', 'Baby & Toddler Toys', 'Toys & Games'],
    slug: 'baby',
  },
  {
    title: 'Top Brands',
    links: ['Apple', 'Samsung', 'Nike', 'Ray-Ban', 'Tefal', 'Starville', 'Chicco', 'Tornado'],
    slug: 'electronics',
  },
  {
    title: 'Discover Now',
    links: ['Brand Glossary', 'Back to School', 'noon Kuwait', 'noon Bahrain',
      'noon Oman', 'noon Qatar'],
    slug: 'electronics',
  },
];
