# [Unsmartwatch](https://unsmartwatch.vercel.app/)

A web-based running tracker that turns your smartphone into a smartwatch alternative. Track your runs with GPS, heart rate monitoring, and export your activities in GPX format.

## Features

- 🗺️ Real-time GPS tracking
- ❤️ Bluetooth heart rate monitor support
- ⏱️ Lap tracking
- 📊 Live statistics (pace, distance, time)
- 📱 PWA support for offline use
- 💾 GPX export for compatibility with other platforms
- 🗺️ OpenStreetMap integration
- 📍 High-accuracy location tracking
- 🔋 Battery-efficient background tracking

## Tech Stack

- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- Leaflet for maps
- Web Bluetooth API
- Geolocation API
- Service Workers for PWA

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn
- Chrome/Edge browser for Web Bluetooth support

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/unsmartwatch.git

# Navigate to the project directory
cd unsmartwatch

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Running with HTTPS (required for Geolocation)

```bash
# Install mkcert
brew install mkcert

# Install local CA
mkcert -install

# Create certificates
mkcert localhost

# Start with HTTPS
HTTPS=true npm run dev
```

## Usage

1. Open the app in Chrome or Edge browser
2. Allow location permissions when prompted
3. (Optional) Connect a Bluetooth heart rate monitor
4. Press the play button to start tracking
5. Use lap button to mark segments
6. Press stop when finished
7. Export your activity in GPX format

## Browser Compatibility

- Chrome (desktop & Android)
- Edge (desktop)
- Safari (limited functionality, no Bluetooth)
- Firefox (limited functionality, no Bluetooth)

## API Reference

### Bluetooth Heart Rate Monitor

The app supports any heart rate monitor that implements the standard Bluetooth GATT Heart Rate Service (0x180D).

### GPX Export

Activities are exported in standard GPX 1.1 format with extensions for:

- Heart rate data
- Elevation data (when available)
- Timestamps
- Accuracy information

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details

## Acknowledgments

- OpenStreetMap contributors for map data
- Leaflet.js team
- shadcn/ui for UI components
