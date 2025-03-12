import React, { useState, useEffect, useRef } from "react";

const App = () => {
  const [isListening, setIsListening] = useState(false);
  const [ephemeralKey, setEphemeralKey] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [dataChannel, setDataChannel] = useState(null);
  const [audioStream, setAudioStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("Initializing...");
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const audioTrackRef = useRef(null);
  const audioTransceiverRef = useRef(null);

  // Fetch the ephemeral key from the Lambda function
  const fetchEphemeralKey = async () => {
    try {
      const response = await fetch(
        "https://localhos:5000/session"
      );
      const data = await response.json();
      setEphemeralKey(data.client_secret.value);
      return data.client_secret.value;
    } catch (error) {
      console.error("Error fetching ephemeral key:", error);
      setConnectionStatus("Failed to fetch key");
      return null;
    }
  };

  // Initialize the WebRTC connection with system instructions
  const initWebRTCConnection = async (key) => {
    if (!key) {
      console.error("Ephemeral key not available");
      setConnectionStatus("No key available");
      return;
    }

    setConnectionStatus("Setting up connection...");
    
    // Create a new peer connection
    const pc = new RTCPeerConnection();
    setPeerConnection(pc);

    // Set up to play remote audio from the model
    pc.ontrack = (e) => {
      if (audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
      }
    };

    // Set up ice candidate handling
    pc.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", pc.iceConnectionState);
      setConnectionStatus(`Connection: ${pc.iceConnectionState}`);
    };

    // Get microphone access
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setAudioStream(mediaStream);
      
      // Store the audio track for later use
      audioTrackRef.current = mediaStream.getAudioTracks()[0];
      
      // Add an audio transceiver with inactive direction initially
      // This ensures audio is included in the SDP but not sending yet
      audioTransceiverRef.current = pc.addTransceiver(audioTrackRef.current, {
        direction: "sendrecv", // Include in SDP but we'll control the track state
        streams: [mediaStream]
      });
      
      // Initially mute the track (this disables sending but keeps it in the SDP)
      audioTrackRef.current.enabled = false;
      
      console.log("Audio track added to connection with initial muted state");
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setConnectionStatus("Microphone access failed");
      return;
    }

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Handle data channel events
    dc.addEventListener("open", () => {
      console.log("Data channel is open and ready to send data");
      setConnectionStatus("Connected");
    });

    /*dc.addEventListener("message", (e) => {
      console.log("Realtime server event:", e.data);
    });*/

    dc.addEventListener("close", () => {
      console.log("Data channel closed");
      setConnectionStatus("Channel closed");
    });

    dc.addEventListener("error", (err) => {
      console.error("Data channel error:", err);
      setConnectionStatus("Channel error");
    });

    // Start the session using the Session Description Protocol (SDP)
    try {
      // Now create the offer AFTER adding the audio track
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-mini-realtime-preview-2024-12-17";
      
      console.log("Sending SDP offer:", offer.sdp);
      
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`API response error: ${errorText}`);
      }

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
      console.log("WebRTC connection established with system instructions");
    } catch (error) {
      console.error("Error establishing WebRTC connection:", error);
      setConnectionStatus("Connection failed");
    }
  };

  // Start listening - enable the audio track and begin recording
  const startListening = () => {
    if (!audioTrackRef.current) {
      console.error("Audio track not available");
      return false;
    }
    
    try {
      // Enable the audio track to start sending
      audioTrackRef.current.enabled = true;
      console.log("Audio track enabled, now sending");
      
      // Start the media recorder
      recordedChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(audioStream);
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        // Only process the data if we're still in listening mode
        if (isListening) {
          const audioBlob = new Blob(recordedChunksRef.current, {
            type: "audio/webm",
          });
          sendAudioData(audioBlob);
        }
      };
      
      mediaRecorderRef.current.start(1000); // Collect data in 1-second chunks
      console.log("Media recorder started");
      return true;
    } catch (error) {
      console.error("Error starting listening:", error);
      return false;
    }
  };

  // Stop listening - disable the audio track and stop recording
  const stopListening = () => {
    try {
      // Stop the media recorder if it's recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        console.log("Media recorder stopped");
      }
      
      // Disable the audio track to stop sending
      if (audioTrackRef.current) {
        audioTrackRef.current.enabled = false;
        console.log("Audio track disabled, no longer sending");
      }
      
      // Clear recorded chunks
      recordedChunksRef.current = [];
      
      return true;
    } catch (error) {
      console.error("Error stopping listening:", error);
      return false;
    }
  };

  // Function to send audio data over the established RTC connection
  const sendAudioData = (audioBlob) => {
    if (dataChannel && dataChannel.readyState === "open" && isListening) {
      console.log("Sending audio data over WebRTC");
      dataChannel.send(audioBlob);
      return true;
    } else {
      console.log("Not sending audio data - channel not ready or not listening");
      return false;
    }
  };

  // Toggle listening state
  const toggleListening = () => {
    if (isListening) {
      // Currently listening, so stop
      const success = stopListening();
      if (success) {
        setIsListening(false);
      }
    } else {
      // Not listening, so start
      const success = startListening();
      if (success) {
        setIsListening(true);
      }
    }
  };

  // Initialize everything when the component mounts
  useEffect(() => {
    const initializeApp = async () => {
      const key = await fetchEphemeralKey();
      if (key) {
        await initWebRTCConnection(key);
      }
    };
    
    initializeApp();
    
    // Clean up function
    return () => {
      // Ensure we stop listening if component unmounts
      if (isListening) {
        stopListening();
      }
      
      // Clean up all media resources
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop());
      }
      
      if (peerConnection) {
        peerConnection.close();
      }
    };
  }, []); // Empty dependency array means this runs once at component mount

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Virtual Voice Chat Simulation</h1>
      <div className="mb-4">
        <div className="p-2 bg-gray-100 rounded">
          Status: {connectionStatus} {isListening ? "- Actively Listening" : ""}
        </div>
      </div>
      <button 
        onClick={toggleListening}
        className={`px-4 py-2 rounded ${
          isListening 
            ? "bg-red-500 hover:bg-red-600" 
            : "bg-green-500 hover:bg-green-600"
        } text-white font-medium`}
        disabled={connectionStatus !== "Connected"}
      >
        {isListening ? "Stop Listening" : "Start Listening"}
      </button>
      {isListening && 
        <div className="mt-2 flex items-center">
          <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse mr-2"></div>
          <p>Listening...</p>
        </div>
      }
      <audio ref={audioRef} autoPlay controls className="mt-4 w-full" />
    </div>
  );
};

export default App;