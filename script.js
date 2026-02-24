// script.js handles the interaction between the user and the AI assistant via the backend server.

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input') || document.getElementById('user-input');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', askAI);
        console.log("Systemet är redo! Knappen hittades.");
    }

    // Allow pressing 'Enter' to send messages
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                askAI();
            }
        });
    }

    // Handle suggestion chips
    const suggestionsContainer = document.querySelector('.chat-suggestions');
    if (suggestionsContainer) {
        suggestionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('chip')) {
                const suggestionText = e.target.textContent;
                const input = document.getElementById('chat-input') || document.getElementById('user-input');
                if (input) {
                    input.value = suggestionText;
                    askAI();
                }
            }
        });
    }
});

async function askAI() {
    // Vi letar efter både chat-input (index) och user-input (projects) för att den ska funka överallt
    const inputField = document.getElementById('chat-input') || document.getElementById('user-input');
    const display = document.getElementById('chat-display') || document.getElementById('chat-box');
    
    if (!inputField || !inputField.value.trim()) return;

    const userText = inputField.value.trim();

    // 1. Visa ditt meddelande direkt
    display.innerHTML += `<div class="message user"><b>Du:</b> ${userText}</div>`;
    inputField.value = ""; 
    display.scrollTop = display.scrollHeight;

    try {
        // 2. Skicka meddelandet till din lokala server
        const response = await fetch("http://localhost:3000/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userText }) // VIKTIGT: Här skickar vi bara "message"
        });

        if (!response.ok) throw new Error('Servern svarade inte korrekt');

        const data = await response.json();
        
        // 3. Visa Annas strategiska svar
        if (data.reply) {
            display.innerHTML += `<div class="message ai"><b>Anna-AI:</b> ${data.reply}</div>`;
        } else {
            display.innerHTML += `<div class="message system" style="color:red;">Kunde inte tolka svaret från AI:n.</div>`;
        }

    } catch (error) {
        console.error("Fel:", error);
        display.innerHTML += `<div class="message system" style="color:red;"><b>System:</b> Servern sover. Kör 'npm start' i terminalen!</div>`;
    }

    display.scrollTop = display.scrollHeight;
}
