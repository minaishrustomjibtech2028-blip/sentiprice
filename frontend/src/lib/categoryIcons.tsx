import {
  Armchair, Baby, Book, Car, Dumbbell, Flower2, Gamepad2, Gem, HeartPulse,
  Laptop, Luggage, Music, Paperclip, PawPrint, Shirt, ShoppingBasket,
  Smartphone, Sparkles, Soup, Puzzle, type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Electronics": Laptop,
  "Fashion & Apparel": Shirt,
  "Beauty & Makeup": Sparkles,
  "Home & Kitchen": Soup,
  "Groceries & Gourmet": ShoppingBasket,
  "Sports & Fitness": Dumbbell,
  "Books & Stationery": Book,
  "Toys & Games": Puzzle,
  "Furniture": Armchair,
  "Automotive": Car,
  "Mobile Accessories": Smartphone,
  "Health & Wellness": HeartPulse,
  "Jewelry & Watches": Gem,
  "Pet Supplies": PawPrint,
  "Baby & Kids": Baby,
  "Office Supplies": Paperclip,
  "Garden & Outdoor": Flower2,
  "Musical Instruments": Music,
  "Luggage & Travel Gear": Luggage,
  "Video Games & Consoles": Gamepad2,
};

export function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] ?? ShoppingBasket;
}
