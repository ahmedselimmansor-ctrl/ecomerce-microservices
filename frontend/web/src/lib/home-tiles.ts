/**
 * بلاطات الأقسام الفرعية في الصفحة الرئيسية.
 *
 * <p>ثابتة عمدًا: هذه تشكيلة تحريرية (merchandising) لا انعكاس آلي لشجرة
 * الأقسام. الاختيار هنا تحريري يدوي حسب الموسم، ولهذا لا يجب اشتقاقها
 * من قاعدة البيانات.
 */

const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=480&q=70`;

export interface Tile {
  label: string;
  slug: string;
  image: string;
}

export const BACK_TO_SCHOOL: Tile[] = [
  { label: 'Lunchboxes & water bottles', slug: 'home', image: img('photo-1584949091598-c31daaaa4aa9') },
  { label: 'Stationery', slug: 'stationery', image: img('photo-1503676260728-1c00da094a0b') },
  { label: 'Laptops', slug: 'laptops', image: img('photo-1517336714731-489689fd1ca8') },
  { label: 'Tablets', slug: 'tablets', image: img('photo-1544244015-0df4b3ffc6b0') },
  { label: "Kids' fashion", slug: 'kids-fashion', image: img('photo-1519238263530-99bdd11df2ea') },
  { label: 'Backpacks', slug: 'bags', image: img('photo-1553062407-98eeb64c6a62') },
  { label: 'Printers', slug: 'printers', image: img('photo-1612815154858-60aa4c59eaa6') },
];

export const ELECTRONICS_TILES: Tile[] = [
  { label: 'TVs', slug: 'tv', image: img('photo-1593359677879-a4bb92f829d1') },
  { label: 'Headsets', slug: 'audio', image: img('photo-1505740420928-5e560c06d30e') },
  { label: 'Video Games', slug: 'gaming', image: img('photo-1606813907291-d86efa9b94db') },
  { label: 'Mobiles', slug: 'mobiles', image: img('photo-1592750475338-74b7b21085ab') },
  { label: 'Cameras', slug: 'cameras', image: img('photo-1502920917128-1aa500764cbd') },
  { label: 'Wearables', slug: 'wearables', image: img('photo-1546868871-7041f2a55e12') },
  { label: 'Laptops', slug: 'laptops', image: img('photo-1517336714731-489689fd1ca8') },
];

export const MENS_TILES: Tile[] = [
  { label: 'Summerwear', slug: 'mens-fashion', image: img('photo-1596755094514-f87e34085b2c') },
  { label: 'T-shirts & polos', slug: 'mens-fashion', image: img('photo-1521572163474-6864f9cf17ab') },
  { label: 'Bottoms', slug: 'mens-fashion', image: img('photo-1542272604-787c3835535d') },
  { label: 'Sportswear', slug: 'mens-fashion', image: img('photo-1571019613454-1cb2f99b2d8b') },
  { label: 'Swimwear', slug: 'mens-fashion', image: img('photo-1607083206968-13611e3d76db') },
  { label: 'Footwear', slug: 'shoes', image: img('photo-1542291026-7eec264c27ff') },
  { label: 'Watches', slug: 'watches', image: img('photo-1524592094714-0f0654e20314') },
];

export const WOMENS_TILES: Tile[] = [
  { label: 'Summerwear', slug: 'womens-fashion', image: img('photo-1515372039744-b8f02a3ae446') },
  { label: 'Swimwear', slug: 'womens-fashion', image: img('photo-1570976447640-ac859a56c30c') },
  { label: 'Sportswear', slug: 'womens-fashion', image: img('photo-1518310383802-640c2de311b2') },
  { label: 'Bottoms', slug: 'womens-fashion', image: img('photo-1541099649105-f69ad21f3246') },
  { label: 'Dresses', slug: 'womens-fashion', image: img('photo-1595777457583-95e059d581b8') },
  { label: 'Bags', slug: 'bags', image: img('photo-1584917865442-de89df76afd3') },
  { label: 'Footwear', slug: 'shoes', image: img('photo-1543163521-1bf539c55dd2') },
];

export const KIDS_TILES: Tile[] = [
  { label: 'Summerwear', slug: 'kids-fashion', image: img('photo-1519238263530-99bdd11df2ea') },
  { label: 'Tops', slug: 'kids-fashion', image: img('photo-1503944583220-79d8926ad5e2') },
  { label: 'Sportswear', slug: 'kids-fashion', image: img('photo-1622290291468-a28f7a7dc6a8') },
  { label: 'Swimwear', slug: 'kids-fashion', image: img('photo-1560506840-ec148e82a604') },
  { label: 'Bottoms', slug: 'kids-fashion', image: img('photo-1519457431-44ccd64a579b') },
  { label: 'Footwear', slug: 'shoes', image: img('photo-1514989940723-e8e51635b782') },
  { label: 'Backpacks', slug: 'bags', image: img('photo-1553062407-98eeb64c6a62') },
];

export const BEAUTY_TILES: Tile[] = [
  { label: 'Makeup', slug: 'beauty', image: img('photo-1596462502278-27bfdc403348') },
  { label: 'Haircare', slug: 'beauty', image: img('photo-1626015365107-1d1c1a4e0b8d') },
  { label: 'Skincare', slug: 'beauty', image: img('photo-1620916566398-39f1143ab7be') },
  { label: 'Personal care', slug: 'beauty', image: img('photo-1556228578-8c89e6adf883') },
  { label: "Women's fragrances", slug: 'beauty', image: img('photo-1541643600914-78b084683601') },
  { label: "Men's fragrances", slug: 'beauty', image: img('photo-1587017539504-67cfbddac569') },
  { label: 'Electric tools', slug: 'beauty', image: img('photo-1522338242992-e1a54906a8da') },
];

export const HOME_TILES: Tile[] = [
  { label: 'Kitchen & dining', slug: 'home', image: img('photo-1556909212-d5b604d0c90d') },
  { label: 'Bath & bedding', slug: 'home', image: img('photo-1522771753-b0e79f5a3b78') },
  { label: 'Furniture', slug: 'home', image: img('photo-1555041469-a586c61ea9bc') },
  { label: 'Kitchen gadgets', slug: 'home', image: img('photo-1556909114-f6e7ad7d3136') },
  { label: 'Home improvement', slug: 'home', image: img('photo-1581578731548-c64695cc6952') },
  { label: 'Home tools', slug: 'home', image: img('photo-1572981779307-38b8cabb2407') },
  { label: 'Storage & organisation', slug: 'home', image: img('photo-1584622650111-993a426fbf0a') },
];

export const APPLIANCE_TILES: Tile[] = [
  { label: 'Coffee machines', slug: 'appliances', image: img('photo-1517668808822-9ebb02f2a0e6') },
  { label: 'Fridges & freezers', slug: 'appliances', image: img('photo-1571175443880-49e1d25b2bc5') },
  { label: 'Irons & steamers', slug: 'appliances', image: img('photo-1489274495757-95c7c837b101') },
  { label: 'Washing machines', slug: 'appliances', image: img('photo-1626806787461-102c1bfaaea1') },
  { label: 'Air fryers', slug: 'appliances', image: img('photo-1585515320310-259814833e62') },
  { label: 'Dishwashers', slug: 'appliances', image: img('photo-1584622650111-993a426fbf0a') },
  { label: 'Air conditioners', slug: 'appliances', image: img('photo-1631545806609-d4b4e00a7b06') },
];

export const SUPERMARKET_TILES: Tile[] = [
  { label: 'Cooking essentials', slug: 'supermarket', image: img('photo-1474979266404-7eaacbcd87c5') },
  { label: 'Canned food', slug: 'supermarket', image: img('photo-1584473457409-ae5c91d7d8b1') },
  { label: 'Beverages', slug: 'supermarket', image: img('photo-1544145945-f90425340c7e') },
  { label: 'Paper & plastic', slug: 'supermarket', image: img('photo-1584556812952-905ffd0c611a') },
  { label: 'Laundry care', slug: 'supermarket', image: img('photo-1610557892470-55d9e80c0bce') },
  { label: 'Household cleaners', slug: 'supermarket', image: img('photo-1563453392212-326f5e854473') },
  { label: 'Pet supplies', slug: 'supermarket', image: img('photo-1583337130417-3346a1be7dee') },
];

export const TOYS_TILES: Tile[] = [
  { label: 'Summer toys', slug: 'toys', image: img('photo-1560506840-ec148e82a604') },
  { label: 'Ride-ons & scooters', slug: 'toys', image: img('photo-1571068316344-75bc76f77890') },
  { label: 'Educational toys', slug: 'toys', image: img('photo-1503676260728-1c00da094a0b') },
  { label: 'Arts & crafts', slug: 'toys', image: img('photo-1513364776144-60967b0f800f') },
  { label: 'Party supplies', slug: 'toys', image: img('photo-1530103862676-de8c9debad1d') },
  { label: 'Card & board games', slug: 'toys', image: img('photo-1611996575749-79a3a250f948') },
  { label: 'Remote control toys', slug: 'toys', image: img('photo-1558877385-81a1c7e67d72') },
];

export const SPORTS_TILES: Tile[] = [
  { label: 'Fitness & strength', slug: 'sports', image: img('photo-1517836357463-d25dfeac3438') },
  { label: 'Yoga & pilates', slug: 'sports', image: img('photo-1544367567-0f2fcb009e0b') },
  { label: 'Cardio', slug: 'sports', image: img('photo-1571019614242-c5c5dee9f50b') },
  { label: 'Skates & scooters', slug: 'sports', image: img('photo-1571068316344-75bc76f77890') },
  { label: 'Combat sports', slug: 'sports', image: img('photo-1549719386-74dfcbf7dbed') },
  { label: 'Racket sports', slug: 'sports', image: img('photo-1595435934249-5df7ed86e1c0') },
  { label: 'Camping', slug: 'sports', image: img('photo-1504280390367-361c6d9f38f4') },
];

export const HEALTH_TILES: Tile[] = [
  { label: 'Medical supplies', slug: 'health', image: img('photo-1584017911766-d451b3d0e843') },
  { label: 'Massage & relaxation', slug: 'health', image: img('photo-1544161515-4ab6ce6db874') },
  { label: 'Sexual wellness', slug: 'health', image: img('photo-1587854692152-cbe660dbde88') },
  { label: 'Vitamins & supplements', slug: 'health', image: img('photo-1607619056574-7b8d3ee536b2') },
  { label: 'Sports nutrition', slug: 'health', image: img('photo-1593095948071-474c5cc2989d') },
  { label: 'Health monitors', slug: 'health', image: img('photo-1576091160550-2173dba999ef') },
  { label: 'Braces & supports', slug: 'health', image: img('photo-1519824145371-296894a0daa9') },
];

export const STATIONERY_TILES: Tile[] = [
  { label: 'Writing supplies', slug: 'stationery', image: img('photo-1455390582262-044cdead277a') },
  { label: 'Paper', slug: 'stationery', image: img('photo-1531346878377-a5be20888e57') },
  { label: 'Arts & crafts', slug: 'stationery', image: img('photo-1513364776144-60967b0f800f') },
  { label: 'Desk organization', slug: 'stationery', image: img('photo-1519389950473-47ba0277781c') },
  { label: 'Office electronics', slug: 'printers', image: img('photo-1612815154858-60aa4c59eaa6') },
  { label: 'Stationery essentials', slug: 'stationery', image: img('photo-1503676260728-1c00da094a0b') },
  { label: 'Books', slug: 'books', image: img('photo-1544947950-fa07a98d237f') },
];

export const AUTOMOTIVE_TILES: Tile[] = [
  { label: 'Car care', slug: 'automotive', image: img('photo-1607860108855-64acf2078ed9') },
  { label: 'Engine oils', slug: 'automotive', image: img('photo-1486262715619-67b85e0b08d3') },
  { label: 'Tyres', slug: 'automotive', image: img('photo-1568605117036-5fe5e7bab0b7') },
  { label: 'Interior accessories', slug: 'automotive', image: img('photo-1449965408869-eaa3f722e40d') },
  { label: 'Exterior accessories', slug: 'automotive', image: img('photo-1503376780353-7e6692767b70') },
  { label: 'Car electronics', slug: 'automotive', image: img('photo-1552519507-da3b142c6e3d') },
  { label: 'Motorcycle accessories', slug: 'automotive', image: img('photo-1558981806-ec527fa84c39') },
];
