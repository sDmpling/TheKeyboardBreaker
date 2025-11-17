# 🚂 Keyboard Breaker

A fast-paced multiplayer racing game where players spam their keyboards to move trains toward the center of a circular track!

## 🎮 How to Play

1. **Join the Game**: Enter your player name when prompted
2. **Spam Keys**: Press ANY keys on your keyboard as fast as possible
3. **Race to Center**: Your train moves faster the more keys you press
4. **Win**: Be the first player to reach the center circle!

## 🌟 Features

- **Multiplayer**: Up to 15 players can race simultaneously
- **Real-time Racing**: Live position updates and leaderboard
- **Key Spamming Mechanics**: Any keyboard input counts toward your speed
- **Visual Effects**: Particle celebrations for winners
- **Mobile Support**: Touch screen support for mobile devices
- **Auto-restart**: Games automatically restart after each race

## 🚀 Quick Start

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser to `http://localhost:3000`

### Replit Deployment

1. Import this project to Replit
2. The game will automatically start
3. Share your Replit URL with friends to play together!

## 🛠 Technology Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JavaScript + CSS3
- **Real-time Communication**: WebSockets via Socket.io
- **Deployment**: Optimized for Replit

## 🎯 Game Mechanics

- **Speed Calculation**: Faster key pressing = higher speed
- **Position System**: 0% = outer track, 100% = center (winner!)
- **Speed Decay**: Speed decreases if you stop pressing keys
- **Winner Detection**: First player to reach 100% position wins
- **Auto-restart**: New games start automatically after 5 seconds

## 🎨 Customization

Want to modify the game? Here are some easy tweaks:

- **Player Limit**: Change `maxPlayers` in `server.js`
- **Track Size**: Modify CSS values in `style.css`
- **Speed Settings**: Adjust speed calculations in the `Player` class
- **Visual Effects**: Add more train emojis to `playerColors` array

## 🐛 Troubleshooting

- **Can't connect**: Make sure the server is running on the correct port
- **Lag issues**: The game runs at 20 FPS for optimal performance
- **Mobile issues**: Ensure touch events are enabled in your browser

## 📝 License

MIT License - Feel free to fork and create your own versions!

---

**Ready to break some keyboards?** 🚂💨