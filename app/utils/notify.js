module.exports = function (title, message, onClick) {
	const n = new Notification(title, {
		body: message
	})

	n.onclick = onClick
}