# Event Cards Readability Fix

## Issue
Event cards had white text on white background, making them completely unreadable.

## Solution
Applied comprehensive dark theme styling to event cards with proper contrast and color coding.

## Changes Applied

### 1. Dark Card Backgrounds
- Changed event cards from white to dark (`#1a1a1a`)
- Ensures proper contrast with light text

### 2. Light Text Colors
- Primary text: `#e5e7eb` (light gray)
- Headings: `#f3f4f6` (off-white)
- Secondary text: `#9ca3af` (medium gray)

### 3. Color-Coded Badges
- **Live Badge**: Red (`#ef4444`) with semi-transparent red background
- **Date/Time Badge**: Blue (`#60a5fa`) with semi-transparent blue background
- **Event Titles**: Light blue (`#60a5fa`) with semi-transparent blue background
- **View All Button**: Purple (`#7c3aed`) with white text

### 4. Glassmorphism Effects
- Semi-transparent backgrounds using `rgba()` with `backdrop-filter: blur(8px)`
- Creates modern, professional look

### 5. Animations
- Pulse animation for live indicator
- Smooth hover effects on buttons
- Respects reduced motion preferences

## Files Modified

1. **frontend/public/css/event-cards-fix.css** (NEW)
   - Complete dark theme styling for event cards
   - Color-coded badges and elements
   - Accessibility considerations

2. **frontend/public/index.html**
   - Added link to `event-cards-fix.css`

## Color Scheme

| Element | Background | Text Color |
|---------|-----------|------------|
| Event Card | `#1a1a1a` | `#e5e7eb` |
| Live Badge | `rgba(239, 68, 68, 0.15)` | `#ef4444` |
| Date Badge | `rgba(59, 130, 246, 0.15)` | `#60a5fa` |
| Event Title | `rgba(59, 130, 246, 0.2)` | `#60a5fa` |
| View All Button | `#7c3aed` | `white` |
| Section Background | `#0a0a0a` | `#e5e7eb` |

## Accessibility

- ✅ High contrast ratios for readability
- ✅ Color is not the only indicator (icons and text)
- ✅ Reduced motion support
- ✅ Touch target sizes maintained (44×44px minimum)

## Testing

- [x] Event cards are readable with dark background
- [x] Badges are visible with proper contrast
- [x] All text is legible
- [x] Hover effects work correctly
- [x] Animations respect reduced motion preferences

## Result

Event cards now have:
- ✅ Dark backgrounds with light text (readable)
- ✅ Visible badges with color-coded information
- ✅ Professional glassmorphism effect
- ✅ Smooth hover effects
- ✅ Consistent dark theme

