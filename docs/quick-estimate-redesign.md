# Quick Estimate Page - Redesign Summary

## Changes Made (June 4, 2026)

### **1. Card Design Hierarchy**

**BEFORE:** All 4 result cards were dark (#1f1f1f) with poor readability

**AFTER:** Visual hierarchy with primary/supporting cards
- **GPUs Required** - Dark card (#1f1f1f) - PRIMARY OUTCOME
  - Largest font: 3.5rem (56px)
  - Font weight: 400 (readable on dark)
  - Red glow effects on hover
  - 3D tilt + specular highlight
  
- **Weight Memory** - Light card (#ffffff) - SUPPORTING DATA
  - Font: 2.25rem (36px)
  - Font weight: 500
  - Subtle shadow, no hover effects
  
- **KV Cache/Request** - Light card - SUPPORTING DATA
  - Font: 2.25rem (36px)
  - Font weight: 500
  - Clean white background
  
- **Monthly Cost** - Light card - SUPPORTING DATA
  - Font: 2.25rem (36px)
  - Font weight: 500
  - Simple design

### **2. Hover Effects - Red Hat Branding**

**Changed from blue (#0066cc) to Red Hat red (#ee0000)**

#### Active Effects on Dark Card:
1. **Outer Glow**: Red (#ee0000), 25px blur, 8px spread
2. **Border Glow**: Red (#ee0000), 2px width
3. **Iridescent Overlay**: Red-orange-pink gradient
   - Hues: 0° (red) → 15-45° (orange) → 340° (pink-red)
   - Shifts with mouse position
   - 20% opacity, overlay blend mode
   
4. **Specular Highlight**: WHITE spotlight following cursor
   - Size: 400px radius
   - Intensity: 80%
   - Soft-light blend mode for visibility
   - Gradient: white → 30% white → transparent
   - **NOW VISIBLE** with improved blend mode
   
5. **3D Perspective Tilt**: 15° max rotation
6. **Noise Texture**: 3% opacity grain overlay

### **3. Typography Improvements**

#### Page Title
```
Font: Red Hat Display
Size: 2rem (32px)
Weight: 500
Letter-spacing: -0.02em
Color: #151515
```

#### Section Headings
```
Font: Red Hat Display
Size: 1.125rem (18px)
Weight: 500
Letter-spacing: -0.01em
```

#### Dark Card
- **Label**: 0.6875rem, weight 600, uppercase, #a3a8ad
- **Number**: 3.5rem (56px), weight 400, #ffffff
- **Suffix**: 1.25rem, weight 400, #d2d2d2
- **Detail**: 0.8125rem, #a3a8ad, Red Hat Text

#### Light Cards
- **Label**: 0.6875rem, weight 600, uppercase, #6a6e73
- **Number**: 2.25rem (36px), weight 500, #151515
- **Suffix**: 1rem, weight 400, #6a6e73
- **Detail**: 0.8125rem, #6a6e73, Red Hat Text

#### Form Inputs
```
Font: Red Hat Text
Size: 0.875rem (14px)
Labels: 0.75rem, weight 600, uppercase
Button: 0.875rem, weight 500
```

#### Constraint Analysis
```
Labels: Red Hat Text, 0.875rem, weight 500
Values: Red Hat Mono, 0.8125rem (monospace for numbers)
Dividers: #f0f0f0 between rows
```

### **4. Button Alignment Fix**

**BEFORE:** Button misaligned with dropdown, using empty label hack

**AFTER:** 
```tsx
<div style={{
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end"
}}>
  <Button style={{ height: "36px" }}>Calculate</Button>
</div>
```
Button now perfectly aligns with GPU dropdown at 36px height.

### **5. Card Sizing**

All cards now have consistent dimensions:
- **Min Height**: 170px
- **Padding**: 1.5rem (24px)
- **Border Radius**: 4px
- **Gap**: PatternFly's default gutter spacing

**KV Cache card is no longer oversized** - all 4 cards are equal width (span={3} = 25% each).

### **6. Color Palette**

#### Dark Card
- Background: #1f1f1f
- Border: #2d2d2d
- Text: #ffffff
- Muted text: #a3a8ad
- Suffix: #d2d2d2

#### Light Cards
- Background: #ffffff
- Border: #d2d2d2
- Text: #151515
- Muted text: #6a6e73
- Shadow: 0 2px 6px rgba(0,0,0,0.08)

#### Accents
- Red Hat Red: #ee0000 (glow, border)
- Blue links: #0066cc
- Green OK badges: PatternFly green
- Warning banner: PatternFly orange

### **7. Effect Tweaks Panel**

27 configurable parameters:
- Position: Fixed bottom-right
- Red Hat branding by default
- Collapsible sections
- Color pickers for glow/specular/border
- Reset to defaults button

### **8. Readability Improvements**

1. **Increased contrast**
   - Dark text on light: #151515 on #ffffff
   - Light text on dark: #ffffff on #1f1f1f
   
2. **Better font weights**
   - Dark card: 400 (not 300 - too thin)
   - Light cards: 500 (medium weight)
   - Labels: 600 (semi-bold)
   
3. **Improved spacing**
   - 0.75rem vertical spacing in cards
   - 1.5rem padding in card body
   - 2rem gaps between sections
   
4. **Monospace for numbers**
   - Red Hat Mono for technical values
   - Improved scanability in constraint table

## Browser Testing

Visit: **http://localhost:3003/performance**

### What to Test:

1. **Hover over dark "GPUs Required" card**
   - Should see red glow around edges
   - Card should tilt with mouse movement
   - White spotlight should follow cursor
   - Subtle red-orange iridescent shimmer

2. **Light cards should NOT have effects**
   - Clean, simple appearance
   - Focus attention on primary metric

3. **Typography**
   - All text should be readable
   - Numbers should be prominent but not overwhelming
   - Consistent font family throughout

4. **Button alignment**
   - Calculate button aligned with GPU dropdown
   - Same height (36px)

5. **Effect tweaks**
   - Click floating button (bottom-right)
   - Adjust sliders to see live changes
   - Red colors by default

## Files Modified

1. `/app/performance/page.tsx`
   - Updated ResultCard component with variant prop
   - Changed card calls to use variant="dark" or "light"
   - Improved typography throughout
   - Fixed button alignment with flexbox

2. `/components/effects/HoverCard.tsx`
   - Changed default colors from blue to red (#ee0000)
   - Improved specular highlight visibility (soft-light blend)
   - Updated iridescent gradient to red-orange-pink spectrum
   - Increased specular size and intensity

3. `/components/effects/EffectTweaksPanel.tsx`
   - Native color inputs (HTML5)
   - 27 individual controls
   - Red Hat defaults

## Design Rationale

### Why only 1 dark card?
- **Visual Hierarchy**: User's primary question is "How many GPUs?"
- **Cognitive Load**: Too many dark cards compete for attention
- **Supporting Data**: Other metrics help explain the primary answer
- **Accessibility**: High contrast dark cards should be used sparingly

### Why red effects?
- **Brand Consistency**: Red Hat company color is #ee0000
- **Recognition**: Matches logo in top-left navigation
- **Professional**: Enterprise software should match brand identity
- **Distinction**: Blue is generic, red is distinctive

### Why larger number on dark card?
- **Primary Metric**: This is what users came to find out
- **Confidence**: Large number communicates certainty
- **Scannability**: User can see answer at a glance

## Next Steps (Future Enhancements)

1. Add animation on Calculate button click
2. Implement "Customize" link functionality
3. Add Range Drivers visualization
4. Make cards clickable for detailed breakdowns
5. Add export functionality
6. Save effect preferences to localStorage
7. Add keyboard shortcuts for tweaks panel
