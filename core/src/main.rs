use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{delete, get, post},
    Router,
};
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};
use uuid::Uuid;

// ─── App State ────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    mqtt_client: AsyncClient,
    sys_data: Arc<RwLock<SysData>>,
    config_path: String,
}

#[derive(Clone, Default)]
struct SysData {
    metrics: HashMap<String, String>,
    topics: Vec<TopicEntry>,
    clients: Vec<ClientEntry>,
    messages: HashMap<String, String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct TopicEntry {
    topic: String,
    message_count: u64,
}

#[derive(Clone, Serialize, Deserialize)]
struct ClientEntry {
    client_id: String,
    connected: bool,
    ip_address: Option<String>,
    protocol: Option<String>,
    connected_at: Option<String>,
}

// ─── API Types ────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
    uptime_seconds: u64,
    mqtt_connected: bool,
}

#[derive(Deserialize)]
struct ConfigUpdate {
    content: String,
}

#[derive(Deserialize)]
struct PublishRequest {
    topic: String,
    payload: String,
    qos: Option<u8>,
    retain: Option<bool>,
}

#[derive(Deserialize, Serialize)]
struct UserEntry {
    username: String,
    password: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct AclEntry {
    id: String,
    user: String,
    topic: String,
    access: String, // "read", "write", "readwrite"
}

#[derive(Deserialize)]
struct AclCreateRequest {
    user: String,
    topic: String,
    access: String,
}

#[derive(Serialize)]
struct ApiError {
    error: String,
    details: Option<String>,
}

fn error_response(status: StatusCode, msg: &str) -> (StatusCode, Json<ApiError>) {
    (
        status,
        Json(ApiError {
            error: msg.to_string(),
            details: None,
        }),
    )
}

fn error_response_detail(status: StatusCode, msg: &str, detail: String) -> (StatusCode, Json<ApiError>) {
    (
        status,
        Json(ApiError {
            error: msg.to_string(),
            details: Some(detail),
        }),
    )
}

// ─── MQTT Sys Topic Processing ───────────────────────────────────────────────

fn process_sys_topic(topic: &str, payload: &str, sys: &mut SysData) {
    sys.metrics.insert(topic.to_string(), payload.to_string());

    if topic == "$SYS/broker/clients/connected" {
        // client count metric — nothing specific to parse further
    } else if topic.starts_with("$SYS/broker/clients/") && topic.ends_with("/ip") {
        // client IP data
        let parts: Vec<&str> = topic.split('/').collect();
        if parts.len() >= 4 {
            let client_id = parts[3].to_string();
            let ip = payload.to_string();
            if let Some(client) = sys.clients.iter_mut().find(|c| c.client_id == client_id) {
                client.ip_address = Some(ip);
            }
        }
    }
}

fn extract_topics_from_metrics(metrics: &HashMap<String, String>) -> Vec<TopicEntry> {
    let mut topics: Vec<TopicEntry> = Vec::new();
    for (key, value) in metrics {
        if key.starts_with("$SYS/broker/messages/") && key.ends_with("/count") {
            let topic_name = key
                .strip_prefix("$SYS/broker/messages/")
                .unwrap_or("")
                .strip_suffix("/count")
                .unwrap_or("");
            if !topic_name.is_empty() {
                let count: u64 = value.parse().unwrap_or(0);
                topics.push(TopicEntry {
                    topic: topic_name.to_string(),
                    message_count: count,
                });
            }
        }
    }
    topics.sort_by(|a, b| b.message_count.cmp(&a.message_count));
    topics
}

// ─── File-based Config Helpers ────────────────────────────────────────────────

fn read_config_file(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("Failed to read config: {}", e))
}

fn write_config_file(path: &str, content: &str) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| format!("Failed to write config: {}", e))
}

fn read_passwd_file(path: &str) -> Vec<UserEntry> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(2, ':').collect();
            if parts.len() == 2 {
                Some(UserEntry {
                    username: parts[0].to_string(),
                    password: None, // Don't expose password hashes
                })
            } else {
                None
            }
        })
        .collect()
}

fn write_passwd_file(path: &str, users: &[UserEntry]) -> Result<(), String> {
    let content: String = users
        .iter()
        .filter_map(|u| {
            u.password.as_ref().map(|p| format!("{}:{}\n", u.username, p))
        })
        .collect();

    std::fs::write(path, content).map_err(|e| format!("Failed to write passwd: {}", e))
}

fn append_passwd_user(path: &str, user: &UserEntry) -> Result<(), String> {
    // Use mosquitto_passwd utility if available, otherwise direct append
    let output = std::process::Command::new("mosquitto_passwd")
        .args(["-b", path, &user.username, user.password.as_deref().unwrap_or("")])
        .output();

    match output {
        Ok(out) if out.status.success() => Ok(()),
        _ => {
            // Fallback: read, modify, write
            let mut users = read_passwd_file(path);
            users.retain(|u| u.username != user.username);
            let new_user = UserEntry {
                username: user.username.clone(),
                password: user.password.clone(),
            };
            users.push(new_user);
            write_passwd_file(path, &users)
        }
    }
}

fn remove_passwd_user(path: &str, username: &str) -> Result<(), String> {
    let output = std::process::Command::new("mosquitto_passwd")
        .args(["-D", path, username])
        .output();

    match output {
        Ok(out) if out.status.success() => Ok(()),
        _ => {
            let mut users = read_passwd_file(path);
            users.retain(|u| u.username != username);
            write_passwd_file(path, &users)
        }
    }
}

fn read_acl_file(path: &str) -> Vec<AclEntry> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    content
        .lines()
        .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let access = if parts[0] == "user" {
                    match parts.get(2) {
                        Some(&"read") | Some(&"subscribe") => "read".to_string(),
                        Some(&"write") | Some(&"publish") => "write".to_string(),
                        Some(&"readwrite") => "readwrite".to_string(),
                        _ => "read".to_string(),
                    }
                } else {
                    return None;
                };

                Some(AclEntry {
                    id: Uuid::new_v4().to_string(),
                    user: parts[1].to_string(),
                    topic: parts.get(3).unwrap_or(&"#").to_string(),
                    access,
                })
            } else {
                None
            }
        })
        .collect()
}

fn append_acl_entry(path: &str, entry: &AclCreateRequest) -> Result<AclEntry, String> {
    let acl_line = match entry.access.as_str() {
        "read" | "subscribe" => format!("user {} read {}\n", entry.user, entry.topic),
        "write" | "publish" => format!("user {} write {}\n", entry.user, entry.topic),
        "readwrite" => format!(
            "user {} read {}\nuser {} write {}\n",
            entry.user, entry.topic, entry.user, entry.topic
        ),
        _ => format!("user {} read {}\n", entry.user, entry.topic),
    };

    let mut current = std::fs::read_to_string(path).unwrap_or_default();
    current.push_str(&acl_line);
    std::fs::write(path, current).map_err(|e| format!("Failed to write ACL: {}", e))?;

    Ok(AclEntry {
        id: Uuid::new_v4().to_string(),
        user: entry.user.clone(),
        topic: entry.topic.clone(),
        access: entry.access.clone(),
    })
}

fn remove_acl_entry(path: &str, acl_id: &str) -> Result<(), String> {
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let filtered: String = content
        .lines()
        .filter(|l| !l.contains(&format!("user {}", acl_id)))
        .map(|l| format!("{}\n", l))
        .collect();
    std::fs::write(path, filtered).map_err(|e| format!("Failed to write ACL: {}", e))?;

    Ok(())
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn health_check(State(_state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: 0, // Would track with a real start time
        mqtt_connected: true,
    })
}

async fn broker_status(State(state): State<AppState>) -> impl IntoResponse {
    let sys = state.sys_data.read().await;
    Json(sys.metrics.clone())
}

async fn broker_config_get(State(state): State<AppState>) -> impl IntoResponse {
    match read_config_file(&state.config_path) {
        Ok(content) => (StatusCode::OK, content).into_response(),
        Err(e) => error_response(StatusCode::NOT_FOUND, &e).into_response(),
    }
}

async fn broker_config_post(
    State(state): State<AppState>,
    Json(body): Json<ConfigUpdate>,
) -> impl IntoResponse {
    match write_config_file(&state.config_path, &body.content) {
        Ok(()) => {
            // Attempt to signal mosquitto to reload
            let _ = std::process::Command::new("killall")
                .args(["-HUP", "mosquitto"])
                .output();

            Json(serde_json::json!({"status": "ok", "message": "Config updated. Reload signal sent."})).into_response()
        }
        Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, &e).into_response(),
    }
}

async fn topics_list(State(state): State<AppState>) -> impl IntoResponse {
    let sys = state.sys_data.read().await;
    let topics = extract_topics_from_metrics(&sys.metrics);
    Json(topics)
}

async fn topic_inspect(
    State(state): State<AppState>,
    Query(mut params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let topic_path = params.remove("topic").unwrap_or_default();
    let decoded = urlencoding::decode(&topic_path).unwrap_or_else(|_| topic_path.clone().into());
    let sys = state.sys_data.read().await;

    let retained = sys.messages.get(decoded.as_ref()).cloned();
    Json(serde_json::json!({
        "topic": decoded,
        "retained_message": retained,
        "stats": sys.metrics.iter()
            .filter(|(k, _)| k.contains(decoded.as_ref()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<HashMap<String, String>>()
    }))
}

async fn topic_publish(
    State(state): State<AppState>,
    Json(body): Json<PublishRequest>,
) -> impl IntoResponse {
    let qos = match body.qos.unwrap_or(0) {
        0 => QoS::AtMostOnce,
        1 => QoS::AtLeastOnce,
        _ => QoS::ExactlyOnce,
    };
    let retain = body.retain.unwrap_or(false);

    match state
        .mqtt_client
        .publish(&body.topic, qos, retain, body.payload.as_bytes())
        .await
    {
        Ok(()) => Json(serde_json::json!({"status": "ok", "topic": body.topic})).into_response(),
        Err(e) => {
            error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("Publish failed: {}", e))
                .into_response()
        }
    }
}

async fn clients_list(State(state): State<AppState>) -> impl IntoResponse {
    let sys = state.sys_data.read().await;
    Json(sys.clients.clone())
}

async fn users_list(State(state): State<AppState>) -> impl IntoResponse {
    let passwd_path = format!("{}/passwd", state.config_path);
    Json(read_passwd_file(&passwd_path))
}

async fn users_create(
    State(state): State<AppState>,
    Json(body): Json<UserEntry>,
) -> impl IntoResponse {
    if body.username.is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "Username is required").into_response();
    }
    if body.password.is_none() || body.password.as_deref().unwrap_or("").is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "Password is required").into_response();
    }

    let passwd_path = format!("{}/passwd", state.config_path);
    match append_passwd_user(&passwd_path, &body) {
        Ok(()) => {
            // Signal mosquitto to reload
            let _ = std::process::Command::new("killall")
                .args(["-HUP", "mosquitto"])
                .output();

            Json(serde_json::json!({"status": "ok", "username": body.username})).into_response()
        }
        Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, &e).into_response(),
    }
}

async fn users_delete(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> impl IntoResponse {
    let passwd_path = format!("{}/passwd", state.config_path);
    match remove_passwd_user(&passwd_path, &username) {
        Ok(()) => {
            let _ = std::process::Command::new("killall")
                .args(["-HUP", "mosquitto"])
                .output();

            Json(serde_json::json!({"status": "ok", "username": username})).into_response()
        }
        Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, &e).into_response(),
    }
}

async fn acl_list(State(state): State<AppState>) -> impl IntoResponse {
    let acl_path = format!("{}/acl", state.config_path);
    Json(read_acl_file(&acl_path))
}

async fn acl_create(
    State(state): State<AppState>,
    Json(body): Json<AclCreateRequest>,
) -> impl IntoResponse {
    if body.user.is_empty() || body.topic.is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "User and topic are required").into_response();
    }

    let acl_path = format!("{}/acl", state.config_path);
    match append_acl_entry(&acl_path, &body) {
        Ok(entry) => {
            let _ = std::process::Command::new("killall")
                .args(["-HUP", "mosquitto"])
                .output();

            (StatusCode::CREATED, Json(entry)).into_response()
        }
        Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, &e).into_response(),
    }
}

async fn acl_delete(
    State(state): State<AppState>,
    Path(acl_id): Path<String>,
) -> impl IntoResponse {
    let acl_path = format!("{}/acl", state.config_path);
    match remove_acl_entry(&acl_path, &acl_id) {
        Ok(()) => Json(serde_json::json!({"status": "ok", "id": acl_id})).into_response(),
        Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, &e).into_response(),
    }
}

// ─── MQTT Event Loop ──────────────────────────────────────────────────────────

async fn mqtt_event_loop(eventloop: &mut rumqttc::EventLoop, state: AppState) {
    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Packet::Publish(p))) => {
                let topic = p.topic.clone();
                let payload = String::from_utf8_lossy(&p.payload).to_string();

                let mut sys = state.sys_data.write().await;
                process_sys_topic(&topic, &payload, &mut sys);
            }
            Ok(Event::Incoming(Packet::ConnAck(_))) => {
                info!("MQTT connected to broker");
                // Subscribe to $SYS topics
                if let Err(e) = state.mqtt_client.subscribe("$SYS/#", QoS::AtMostOnce).await {
                    warn!("Failed to subscribe to $SYS/#: {}", e);
                }
            }
            Ok(Event::Incoming(_)) => {}
            Ok(Event::Outgoing(_)) => {}
            Err(e) => {
                error!("MQTT error: {}", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            }
        }
    }
}

// ─── Server Startup ───────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    info!("Starting MQTT Manager v{}", env!("CARGO_PKG_VERSION"));

    // Config paths
    let config_dir = std::env::var("MQTT_CONFIG_DIR").unwrap_or_else(|_| "/config".to_string());
    let mqtt_host = std::env::var("MQTT_HOST").unwrap_or_else(|_| "localhost".to_string());
    let mqtt_port: u16 = std::env::var("MQTT_PORT")
        .unwrap_or_else(|_| "1883".to_string())
        .parse()
        .unwrap_or(1883);
    let server_port: u16 = std::env::var("SERVER_PORT")
        .unwrap_or_else(|_| "8000".to_string())
        .parse()
        .unwrap_or(8000);

    // Ensure config directory exists
    if let Err(e) = std::fs::create_dir_all(&config_dir) {
        warn!("Could not create config dir {}: {}", config_dir, e);
    }

    // MQTT client setup
    let client_id = format!("mqtt-manager-{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("core"));
    let mut mqttoptions = MqttOptions::new(&client_id, &mqtt_host, mqtt_port);
    mqttoptions.set_keep_alive(std::time::Duration::from_secs(30));
    mqttoptions.set_clean_session(false);

    let (mqtt_client, mut eventloop) = AsyncClient::new(mqttoptions, 100);

    let state = AppState {
        mqtt_client: mqtt_client.clone(),
        sys_data: Arc::new(RwLock::new(SysData::default())),
        config_path: config_dir,
    };

    // Spawn MQTT event loop
    let event_state = state.clone();
    tokio::spawn(async move {
        mqtt_event_loop(&mut eventloop, event_state).await;
    });

    // CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Routes
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/broker/status", get(broker_status))
        .route("/api/broker/config", get(broker_config_get).post(broker_config_post))
        .route("/api/topics", get(topics_list))
        .route("/api/topics/publish", post(topic_publish))
        .route("/api/topics/inspect", get(topic_inspect))
        .route("/api/clients", get(clients_list))
        .route("/api/users", get(users_list).post(users_create))
        .route("/api/users/{username}", delete(users_delete))
        .route("/api/acl", get(acl_list).post(acl_create))
        .route("/api/acl/{acl_id}", delete(acl_delete))
        .layer(cors)
        .fallback_service(
            tower_http::services::ServeDir::new("/app/frontend/dist")
        )
        .with_state(state);

    let addr = format!("0.0.0.0:{}", server_port);
    info!("MQTT Manager listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
