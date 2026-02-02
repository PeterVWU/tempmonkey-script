/**
 * Duoplane API Proxy Worker
 * Proxies requests to Duoplane API with stored credentials
 */

const DUOPLANE_BASE = 'https://app.duoplane.com';

// CORS headers for browser requests
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
	async fetch(request, env, ctx) {
		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(request.url);
		const path = url.pathname;
		const authHeader = 'Basic ' + btoa(env.DUOPLANE_API_USERNAME + ':' + env.DUOPLANE_API_PASSWORD);

		console.log(`[Proxy] ${request.method} ${path}`);

		try {
			// GET /orders?order_number=XXX - Look up order ID by order number
			if (request.method === 'GET' && path === '/orders') {
				const orderNumber = url.searchParams.get('order_number');
				if (!orderNumber) {
					console.log('[Proxy] Error: order_number required');
					return jsonResponse({ error: 'order_number required' }, 400);
				}

				const duoplaneUrl = `${DUOPLANE_BASE}/purchase_orders.json?search[order_public_reference]=${orderNumber}`;
				console.log('[Proxy] Fetching:', duoplaneUrl);

				const response = await fetch(duoplaneUrl, {
					headers: { 'Authorization': authHeader },
				});

				const data = await response.json();
				console.log('[Proxy] Duoplane response status:', response.status);
				console.log('[Proxy] Duoplane response data:', JSON.stringify(data));

				if (data && data.length > 0) {
					return jsonResponse({ order_id: data[0].order_id });
				}
				return jsonResponse({ error: 'Order not found' }, 404);
			}

			// GET /orders/:id/comments - Get comments for an order
			if (request.method === 'GET' && path.match(/^\/orders\/\d+\/comments$/)) {
				const orderId = path.split('/')[2];
				const duoplaneUrl = `${DUOPLANE_BASE}/orders/${orderId}/comments.json`;
				console.log('[Proxy] Fetching comments:', duoplaneUrl);

				const response = await fetch(duoplaneUrl, {
					headers: { 'Authorization': authHeader },
				});

				console.log('[Proxy] Duoplane response status:', response.status);

				if (response.ok) {
					const data = await response.json();
					console.log('[Proxy] Comments count:', data.length);
					console.log('[Proxy] Comments data:', JSON.stringify(data));
					return jsonResponse({ comments: data });
				}
				console.log('[Proxy] Error: Failed to get comments');
				return jsonResponse({ error: 'Failed to get comments' }, response.status);
			}

			// POST /orders/:id/comments - Create a new comment
			if (request.method === 'POST' && path.match(/^\/orders\/\d+\/comments$/)) {
				const orderId = path.split('/')[2];
				const body = await request.json();
				console.log('[Proxy] Request payload:', JSON.stringify(body));

				const duoplaneUrl = `${DUOPLANE_BASE}/orders/${orderId}/comments.json`;
				const duoplanePayload = {
					comment: { body: body.comment_body },
				};
				console.log('[Proxy] POST to:', duoplaneUrl);
				console.log('[Proxy] Duoplane payload:', JSON.stringify(duoplanePayload));

				const response = await fetch(duoplaneUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': authHeader,
					},
					body: JSON.stringify(duoplanePayload),
				});

				console.log('[Proxy] Duoplane response status:', response.status);
				const responseText = await response.text();
				console.log('[Proxy] Duoplane response body:', responseText);

				if (response.ok) {
					return jsonResponse({ success: true });
				}
				return jsonResponse({ error: 'Failed to post comment', details: responseText }, response.status);
			}

			// PUT /orders/:id/comments/:comment_id - Update an existing comment
			if (request.method === 'PUT' && path.match(/^\/orders\/\d+\/comments\/\d+$/)) {
				const parts = path.split('/');
				const orderId = parts[2];
				const commentId = parts[4];
				const body = await request.json();
				console.log('[Proxy] Request payload:', JSON.stringify(body));

				const duoplaneUrl = `${DUOPLANE_BASE}/orders/${orderId}/comments/${commentId}.json`;
				const duoplanePayload = {
					comment: { body: body.comment_body },
				};
				console.log('[Proxy] PUT to:', duoplaneUrl);
				console.log('[Proxy] Duoplane payload:', JSON.stringify(duoplanePayload));

				const response = await fetch(duoplaneUrl, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': authHeader,
					},
					body: JSON.stringify(duoplanePayload),
				});

				console.log('[Proxy] Duoplane response status:', response.status);
				const responseText = await response.text();
				console.log('[Proxy] Duoplane response body:', responseText);

				if (response.ok) {
					return jsonResponse({ success: true });
				}
				return jsonResponse({ error: 'Failed to update comment', details: responseText }, response.status);
			}

			console.log('[Proxy] No matching route');
			return jsonResponse({ error: 'Not found' }, 404);
		} catch (error) {
			console.log('[Proxy] Error:', error.message, error.stack);
			return jsonResponse({ error: error.message }, 500);
		}
	},
};

function jsonResponse(data, status = 200) {
	console.log('[Proxy] Response:', status, JSON.stringify(data));
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders,
		},
	});
}
