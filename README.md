Overview
This project is a web application that allows users to interact with a voice-based AI model using OpenAI's Realtime API. The app enables users to have a real-time voice conversation with the AI model, where they can speak into their microphone, and the AI responds with voice output. The app leverages WebRTC for real-time communication and the OpenAI Realtime API for processing voice input and generating responses.

Features
Voice Input: Users can speak into their microphone to interact with the AI model.

Real-Time Voice Output: The AI model responds with voice output, which is played back to the user in real-time.

Persistent WebRTC Connection: The app maintains a single WebRTC connection for the duration of the session, avoiding the need to renegotiate the connection for each request.

Dynamic Data Handling: If the WebRTC data channel is not yet open, the app queues the audio data and sends it once the channel is ready.

How It Works
1. Ephemeral Key Fetching:
   The app fetches an ephemeral key from a Lambda function, which is used to authenticate requests to the OpenAI Realtime API.

2. WebRTC Connection Setup:
   A WebRTC peer connection is established, and a data channel is created for sending and receiving audio data.

3. Voice Input Capture:
   The app uses the MediaRecorder API to capture audio input from the user's microphone.

4. Audio Data Transmission:
   The captured audio is sent to the OpenAI Realtime API via the WebRTC data channel.

5. Voice Output Playback:
   The AI model processes the audio input and sends back a voice response, which is played to the user through an <audio> element.

6. Continuous Interaction:
   The user can continue speaking, and the app will send new audio data over the existing WebRTC connection, enabling a seamless conversation.

Usage
1. Open the app in your browser.
2. Click "Start Listening" to begin capturing voice input.
3. Speak into your microphone.
4. Click "Stop Listening" to send the audio to the OpenAI Realtime API.
5. The AI model will respond with voice output, which will be played back to you.
6. Repeat the process to continue the conversation.
