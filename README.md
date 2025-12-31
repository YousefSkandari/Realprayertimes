# Fajr Prayer Time Calculator

A mobile-first, responsive web application that calculates accurate Fajr (dawn) prayer times based on geographic location, elevation, and preferred calculation convention.

## Features

### Core Features
- **Auto-detect Location**: Uses browser Geolocation API with permission prompt
- **Manual Location Input**: Supports both decimal degrees and DMS format (e.g., 53°19′57″ N)
- **City Search**: Geocoding via OpenStreetMap Nominatim API
- **Elevation Support**: Manual input or auto-fetch from Open-Elevation API
- **Multiple Calculation Methods**: MWL, ISNA, Egypt, Makkah, Karachi, Tehran, Singapore, and Custom angles
- **Date Selection**: View Fajr times for any date
- **Monthly Calendar**: View entire month's prayer times at a glance

### User Experience
- **Countdown Timer**: Live countdown to next Fajr
- **Sunrise Display**: Shows sunrise time alongside Fajr
- **Dark Mode**: Auto-detects system preference with manual toggle
- **Save Locations**: Store multiple locations for quick access
- **Share Times**: Share prayer times via native share or clipboard
- **High Latitude Handling**: Automatic adjustments with fallback methods

### Technical Features
- **Progressive Web App (PWA)**: Install on home screen, works offline
- **Responsive Design**: Mobile-first, works on all screen sizes
- **Accessibility**: WCAG 2.1 AA compliant with screen reader support
- **Performance**: All calculations run client-side, no server required

## Calculation Methods

| Convention | Fajr Angle | Organisation |
|------------|------------|--------------|
| MWL | 18° | Muslim World League |
| ISNA | 15° | Islamic Society of North America |
| Egypt | 19.5° | Egyptian General Authority of Survey |
| Makkah | 18.5° | Umm al-Qura University |
| Karachi | 18° | University of Islamic Sciences, Karachi |
| Tehran | 17.7° | Institute of Geophysics, Tehran |
| Singapore | 20° | MUIS (Singapore) |
| Custom | User-defined | Manual angle input |

## Mathematical Formulas

### Solar Declination (δ)
```
δ = 23.45° × sin((360/365) × (d - 81))
```

### Equation of Time (EoT)
```
B = (360/365) × (d - 81)
EoT = 9.87 × sin(2B) - 7.53 × cos(B) - 1.5 × sin(B)
```

### Solar Noon
```
Solar Noon = 12:00 - EoT - (4 × longitude / 60) + timezone
```

### Hour Angle for Fajr
```
cos(H) = [sin(α) - sin(φ) × sin(δ)] / [cos(φ) × cos(δ)]
```

### Elevation Adjustment
```
θ_dip = √(2h / R) radians
α_adjusted = α + θ_dip
```

## High Latitude Adjustments

At latitudes above ~48.5°, the sun may not dip below the required angle during summer months. The app implements fallback methods:

1. **Seventh of Night**: Fajr = Sunset + (1/7 × night duration)
2. **Middle of Night**: Split night duration and estimate
3. **Angle-based**: Use a shallower angle (e.g., 15° instead of 18°)

A warning is displayed when these methods are used.

## Installation

### Local Development
```bash
# Clone the repository
git clone https://github.com/yourusername/Realprayertimes.git
cd Realprayertimes

# Serve with any static file server
npx serve .
# or
python -m http.server 8000
```

### Deploy to GitHub Pages
1. Push to `main` branch
2. Go to Settings > Pages
3. Select "Deploy from a branch" > `main` > `/ (root)`

### Deploy to Netlify/Vercel
Simply connect your repository and deploy. No build step required.

## Project Structure

```
Realprayertimes/
├── index.html          # Main HTML file
├── manifest.json       # PWA manifest
├── sw.js              # Service worker for offline support
├── css/
│   └── styles.css     # Custom CSS styles
├── js/
│   ├── calculations.js # Prayer time calculation engine
│   ├── storage.js     # Local storage manager
│   └── app.js         # Main application logic
├── icons/
│   └── icon.svg       # App icon
└── README.md          # This file
```

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- iOS Safari 13+
- Samsung Internet 12+

## Test Cases

| Location | Elevation | Convention | Date | Expected Fajr |
|----------|-----------|------------|------|---------------|
| 53.3325°N, 2.1331°W | 100m | MWL (18°) | Dec 31 | ~06:11 |
| 53.3325°N, 2.1331°W | 1085m | MWL (18°) | Dec 31 | ~06:05 |
| 21.4225°N, 39.8262°E | 0m | Makkah | Dec 31 | ~05:42 |
| 51.5074°N, 0.1278°W | 0m | MWL (18°) | Jun 21 | ~02:15* |

*May require fallback method at high latitudes in summer

## Accessibility

- Semantic HTML structure
- ARIA labels on all interactive elements
- Keyboard navigable
- Screen reader friendly announcements
- Reduced motion support
- High contrast support
- Minimum 44x44px touch targets

## Performance

- Lightweight (~50KB total)
- No external JavaScript dependencies (Tailwind loaded from CDN)
- All calculations run client-side
- Service worker caching for instant repeat loads
- Lazy loading for modals

## License

MIT License - feel free to use, modify, and distribute.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- [OpenStreetMap Nominatim](https://nominatim.org/) for geocoding
- [Open-Elevation](https://open-elevation.com/) for elevation data
- [Tailwind CSS](https://tailwindcss.com/) for styling
