// script.js handles the interaction between the user and the AI assistant via the backend server.

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', askAI);
        console.log("Systemet är redo! Knappen hittades.");
    } else {
        console.error("Kunde inte hitta knappen 'send-btn'. Kolla din index.html!");
    }

    // Allow pressing 'Enter' to send messages
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                askAI();
            }
        });
    }
});

async function askAI() {
    const input = document.getElementById('chat-input');
    const display = document.getElementById('chat-display');
    const userText = input.value.trim();

    if (!userText) return;

    // Display user message
    display.innerHTML += `<div class="message user"><b>Du:</b> ${userText}</div>`;
    input.value = ""; 
    display.scrollTop = display.scrollHeight;

    try {
        // Send request to our local backend proxy
        const response = await fetch("http://localhost:3000/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messages: [
                    { 
                        role: "system", 
                        content: "Du är en AI-assistent för Anna Frankendal. Svara på svenska. Du är expert på Annas projekt och hennes erfarenhet från Berghs. Var glad och professionell." 
                    },
                    { role: "user", content: userText }
                ]
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0]) {
            const aiAnswer = data.choices[0].message.content;
            display.innerHTML += `<div class="message ai"><b>Anna-AI:</b> ${aiAnswer}</div>`;
        } else {
            console.error('API Error:', data);
            display.innerHTML += `<p style="color:red;"><b>System:</b> Något gick fel med AI-svaret.</p>`;
        }

    } catch (error) {
        console.error("Fel:", error);
        display.innerHTML += `<p style="color:red;"><b>System:</b> Kunde inte kontakta servern. Se till att backend körs.</p>`;
    }

    display.scrollTop = display.scrollHeight;
}
