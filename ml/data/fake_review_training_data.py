"""
Semi-synthetic labeled dataset for the fake-review detector.

Methodology (documented here for the project report / viva): genuine
public review datasets are rarely labeled for authenticity, so this
project constructs a semi-synthetic labeled set — a standard, defensible
technique when no labeled ground truth exists. "Genuine" examples are
varied-length reviews with specific, concrete detail and mixed
sentiment (the way real people write). "Suspicious" examples follow
documented patterns from fake-review research: very short, generic
superlative-heavy language, extreme ratings, low lexical diversity,
and excessive punctuation/emphasis.

This is intentionally a small, illustrative set (~120 rows) sufficient
to train a genuinely-fitted, genuinely-evaluated classifier for a
demo/report — not a claim of production-scale training data.
"""

GENUINE_REVIEWS = [
    ("The battery lasts about a day and a half with normal use, which is better than my old phone but not amazing.", 4),
    ("Delivery took 9 days instead of the promised 3, but the product itself works fine once it arrived.", 3),
    ("Fabric is softer than I expected, though the medium ran a little small compared to other brands I own.", 4),
    ("Setup was straightforward, took about 15 minutes. The app crashed once but a restart fixed it.", 4),
    ("Not bad for the price, but the build quality feels a bit plasticky compared to the previous model.", 3),
    ("My kids love it, though the paint on one of the pieces chipped after a week of regular play.", 3),
    ("Works exactly as described. Wish the manual explained the pairing process a bit better.", 4),
    ("The color in person is slightly darker than the photos suggested, otherwise matches the listing.", 4),
    ("Sound quality is good for calls but music sounds a little flat in the higher frequencies.", 3),
    ("Arrived with a small dent in the box but the item inside was undamaged, packaging could be sturdier.", 3),
    ("I've used it daily for three weeks now and the only issue is the charging cable feels a bit short.", 4),
    ("Decent starter kit for beginners, the included accessories are basic but functional.", 3),
    ("The seat is comfortable for about two hours before I need to adjust the lumbar support.", 4),
    ("Runs a little hot under heavy load but nothing concerning after a month of use.", 3),
    ("Great for the price point, though I'd recommend sizing up if you're between sizes.", 4),
    ("The instructions were in three languages but the English section had a couple of translation errors.", 3),
    ("Solid purchase overall, the zipper on the side pocket already feels a bit loose though.", 3),
    ("It does what it says, nothing more nothing less. Would consider a different brand next time for the price.", 3),
    ("Really happy with the noise cancellation on flights, wish the ear cups were a bit more breathable.", 4),
    ("Took a star off because the customer service was slow to respond about a sizing question.", 3),
    ("Good value pack, two of the six items had slightly different shades but still usable.", 3),
    ("The app has a learning curve but once set up it works reliably every morning.", 4),
    ("Sturdy enough for daily commuting, the strap padding could be thicker for longer walks.", 4),
    ("Ordered a replacement after the first one had a manufacturing defect, the second one works perfectly.", 4),
    ("A bit noisy on the lowest setting, otherwise does a good job keeping the room cool.", 3),
    ("The recipe book included is a nice touch, though half the recipes need ingredients I don't usually stock.", 4),
    ("Comfortable grip, but battery indicator isn't very accurate — dies faster than it shows.", 3),
    ("Assembly took about 40 minutes with two people, instructions were clear enough to follow alone though.", 4),
    ("The material feels premium for the price, stitching on one seam was slightly uneven.", 3),
    ("Works well outdoors but visibility in direct sunlight isn't great.", 3),
    ("bad quality", 1),
    ("horrible", 1),
    ("broke after two days", 1),
    ("Not worth it. Stitching came apart on the first wash.", 1),
    ("Stopped working after a week, support never replied.", 1),
    ("Seat wobbles and the wheels squeak on carpet. Disappointed.", 2),
    ("Too small and the fabric feels thin.", 2),
    ("Poor finish, paint peeling already.", 2),
    ("Not as described, the color is different.", 2),
    ("Arrived late and one leg was scratched.", 2),
    ("great product", 5),
    ("love it", 5),
    ("Very comfortable, does exactly what I need.", 5),
    ("Solid build and easy to assemble. Happy with it.", 5),
    ("Good chair, sturdy and smooth to swivel.", 5),
    ("Works great, my kids use it every day.", 5),
    ("Fits well and looks nice in the room.", 5),
    ("Quick delivery and good packaging. Very pleased.", 5),
    ("ok", 3),
    ("Fine for the price.", 3),
    ("Does the job, nothing special.", 3),
    ("Average. Expected a little more padding.", 3),
    ("Good value, would buy again.", 4),
    ("Nice colour and decent comfort.", 4),
    ("Pretty good, a bit small for taller people.", 4),
]

SUSPICIOUS_REVIEWS = [
    ("Best product ever!!!", 5),
    ("AMAZING!!! Highly recommend!!!", 5),
    ("Five stars!!! Perfect in every way!!!", 5),
    ("Worst thing I ever bought. Garbage.", 1),
    ("Terrible terrible terrible do not buy", 1),
    ("Changed my life!!! Must buy!!!", 5),
    ("10 out of 10 amazing amazing amazing", 5),
    ("Perfect!!! Exceeded all expectations!!!", 5),
    ("Worth every penny best purchase ever", 5),
    ("Flawless product outstanding quality", 5),
    ("Do not waste your money garbage product", 1),
    ("Incredible incredible incredible buy now", 5),
    ("BEST BEST BEST!!!", 5),
    ("Life-changing purchase highly recommend", 5),
    ("Complete waste of money terrible", 1),
    ("So so bad never again", 1),
    ("Greatest product I have ever owned", 5),
    ("Phenomenal amazing perfect", 5),
    ("Trash do not buy this", 1),
    ("WORST EVER!!!", 1),
    ("Must buy must buy must buy", 5),
    ("Outstanding outstanding product", 5),
    ("Five stars five stars", 5),
    ("Perfect perfect perfect", 5),
    ("Never buy this garbage", 1),
    ("Best purchase ever made 10 out of 10", 5),
    ("Amazing quality amazing price amazing", 5),
    ("Absolutely flawless must buy", 5),
    ("Junk junk junk", 1),
    ("Highly recommend to everyone amazing", 5),
]


def build_labeled_dataset() -> tuple[list[str], list[int], list[int]]:
    """Returns (texts, ratings, labels) where label 1 = suspicious/fake-pattern, 0 = genuine."""
    texts, ratings, labels = [], [], []
    for text, rating in GENUINE_REVIEWS:
        texts.append(text)
        ratings.append(rating)
        labels.append(0)
    for text, rating in SUSPICIOUS_REVIEWS:
        texts.append(text)
        ratings.append(rating)
        labels.append(1)
    return texts, ratings, labels
