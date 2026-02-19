async function loadMessages() {
    try {
        const response = await fetch("/api/getMessages");
        if (!response.ok) throw new Error("Failed to load");
        return response.json();
    } catch {

    }
}