import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Target URL
BASE_URL = "https://www.eazydiner.com/delhi-ncr/fired-up-m3m-65th-avenue-sector-65-gurgaon-711916/menu"

# Directory to save images
SAVE_DIR = "menu_images"
os.makedirs(SAVE_DIR, exist_ok=True)

# Fetch page
response = requests.get(BASE_URL)
if response.status_code != 200:
    print(f"Failed to fetch page: {response.status_code}")
    exit(1)

# Parse HTML
soup = BeautifulSoup(response.text, "html.parser")

# Find all images
images = soup.find_all("img")

print(f"Found {len(images)} image tags — checking for menu images...")

downloaded = 0

for img in images:
    # Get image src
    img_url = img.get("src") or img.get("data-src")
    if not img_url:
        continue

    # Make absolute URL
    img_url = urljoin(BASE_URL, img_url)

    # Only download image if it looks like a menu item (optional filter)
    # You can refine this filter based on the URL pattern
    if "menu" not in img_url.lower() and ("dish" not in img_url.lower()):
        # Skip images that are clearly NOT menu items
        continue

    # Derive filename
    parsed = urlparse(img_url)
    filename = os.path.basename(parsed.path)

    # Download file
    try:
        img_data = requests.get(img_url).content
        with open(os.path.join(SAVE_DIR, filename), "wb") as f:
            f.write(img_data)
        downloaded += 1
        print(f"Saved: {filename}")
    except Exception as e:
        print(f"Failed to download {img_url}: {e}")

print(f"\nDownloaded {downloaded} images to ./{SAVE_DIR}")