let gifs = ["1.gif", "2.gif", "3.gif", "4.gif"];
let previous = "1.gif";

function chat(text, type) {
	let now = new Date();
	let hours = now.getHours();
	let minutes = now.getMinutes();
	let ampm = hours >= 12 ? "PM" : "AM";
	hours = hours % 12 || 12;
	minutes = minutes < 10 ? "0" + minutes : minutes;
	let time = hours + ":" + minutes + ampm;
	$("#chat").append(`
	<div>
		<div class="${type}">
			<p>${time}</p>
			<p>${text}</p>
		</div>
	</div>
	`);
}

function call(text) {
	fetch("/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ message: text }),
	})
		.then((res) => res.json())
		.then((data) => {
			let random = "";
			do random = gifs[Math.floor(Math.random() * gifs.length)];
			while (random === previous);
			$("#character img").attr("src", `assets/${random}`);
			previous = random;
			chat(data.reply.toLowerCase(), "response");
			$("#chat").animate({ scrollTop: $("#chat")[0].scrollHeight }, 600);
		})
		.catch((err) => {
			console.error("Error:", err);
		});
}

$(document).ready(() => {
	setTimeout(() => {
		chat(
			"i am soumya's manager, and she's brilliant. ask and see how.",
			"response",
		);
		$("#chat").animate({ scrollTop: $("#chat")[0].scrollHeight }, 600);
	}, 2000);
	$("#field").on("keydown", (event) => {
		if (event.key === "Enter") {
			let value = $("#field")[0].value.trim();
			if (value !== "") {
				chat(value, "message");
				$("#chat").animate(
					{
						scrollTop: $("#chat")[0].scrollHeight,
					},
					600,
					call(value),
				);
				$("#field").val("");
				$("#field").blur();
			}
		}
	});
	$("#send").click(() => {
		let value = $("#field")[0].value.trim();
		if (value !== "") {
			chat(value, "message");
			$("#chat").animate(
				{
					scrollTop: $("#chat")[0].scrollHeight,
				},
				600,
				call(value),
			);
			$("#field").val("");
			$("#field").blur();
		}
	});
});
