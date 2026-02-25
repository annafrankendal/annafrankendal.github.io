// script.js handles the interaction between the user and the AI assistant.

document.addEventListener('DOMContentLoaded', () => {
    // Vi letar efter knappen på alla sidor
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input') || document.getElementById('user-input');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', askAI);
        console.log("Anna-AI: Systemet är redo.");
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                askAI();
            }
        });
    }

    // Hantera suggestion chips (förslag)
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

function toggleChat() {
    const chatContainer = document.getElementById('ai-chat-container');
    const trigger = document.querySelector('.chat-trigger');
    
    if (chatContainer.style.display === 'flex') {
        chatContainer.style.display = 'none';
        trigger.innerHTML = '💬';
        trigger.classList.remove('active');
    } else {
        chatContainer.style.display = 'flex';
        trigger.innerHTML = '✕';
        trigger.classList.add('active');
        // Skrolla till botten när den öppnas
        const display = document.getElementById('chat-display');
        if (display) display.scrollTop = display.scrollHeight;
    }
}

async function askAI() {
    const inputField = document.getElementById('chat-input') || document.getElementById('user-input');
    const display = document.getElementById('chat-display') || document.getElementById('chat-box');
    
    if (!inputField || !inputField.value.trim()) return;

    const userText = inputField.value.trim();

    // 1. Visa ditt meddelande direkt
    if (display) {
        display.innerHTML += `<div class="message user"><b>Du:</b> ${userText}</div>`;
        display.scrollTop = display.scrollHeight;
    }
    
    inputField.value = ""; 

    try {
        // 2. Skicka meddelandet till backend
        // Vi använder en relativ sökväg /api/chat så att den fungerar både lokalt och på nätet
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? "http://localhost:3000/api/chat" 
            : "https://anna-backend-f8i9.onrender.com/api/chat";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userText })
        });

        if (!response.ok) throw new Error('Servern svarade inte korrekt');

        const data = await response.json();
        
        // 3. Visa Annas strategiska svar
        if (data.reply && display) {
            display.innerHTML += `<div class="message ai"><b>Anna-AI:</b> ${data.reply}</div>`;
        } else if (display) {
            display.innerHTML += `<div class="message system" style="color:red;">Kunde inte tolka svaret.</div>`;
        }

    } catch (error) {
        console.error("Fel:", error);
        if (display) {
            display.innerHTML += `<div class="message system" style="color:red;"><b>System:</b> Servern sover. Kör 'npm start' i terminalen!</div>`;
        }
    }

    if (display) {
        display.scrollTop = display.scrollHeight;
    }
}
