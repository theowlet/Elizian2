--
-- PostgreSQL database cluster dump
--

\restrict O3jLmGT0E5xoan1PuQykodYj4bYpT7vHbY4arfTwBkIXh0hbVrCPnwt3ThfcVYe

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE elizian_user;
ALTER ROLE elizian_user WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:ZvQFTJC8VDBfLqpcnag+pw==$I9fgFS/QZg3r9OwP0mdQpDe0QTAfjY1ERS0U3vHEiT4=:/q2LwkvAdPmONvb6Phndx3MdaTg1IAr6MjiAK7VPmFM=';
CREATE ROLE nishantverma;
ALTER ROLE nishantverma WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;
CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:fTOQjHoo2qquKrw2cgbYwA==$+gKPn6trZVtL88Nrtu9qiISf9wYeaNSdjcPBeiyqlOA=:bQLDyKl4/u6ccIZx6wvnpnnKFngHWcITysguFHuWUE8=';

--
-- User Configurations
--








\unrestrict O3jLmGT0E5xoan1PuQykodYj4bYpT7vHbY4arfTwBkIXh0hbVrCPnwt3ThfcVYe

--
-- Databases
--

--
-- Database "template1" dump
--

\connect template1

--
-- PostgreSQL database dump
--

\restrict ZT4DkWj1NjMH8GCwrFlg82pIuCWelKX01OTu8iyAPC32eE6nVBnhj84sXpbcAWM

-- Dumped from database version 16.10 (Homebrew)
-- Dumped by pg_dump version 16.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- PostgreSQL database dump complete
--

\unrestrict ZT4DkWj1NjMH8GCwrFlg82pIuCWelKX01OTu8iyAPC32eE6nVBnhj84sXpbcAWM

--
-- Database "elizian" dump
--

--
-- PostgreSQL database dump
--

\restrict OdElzBCDb4ZjT7mG6C9df7VIxaBBsVrajTFwKvBShyeAIklolhtb74wwi1jPxWf

-- Dumped from database version 16.10 (Homebrew)
-- Dumped by pg_dump version 16.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: elizian; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE elizian WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.UTF-8';


ALTER DATABASE elizian OWNER TO postgres;

\unrestrict OdElzBCDb4ZjT7mG6C9df7VIxaBBsVrajTFwKvBShyeAIklolhtb74wwi1jPxWf
\connect elizian
\restrict OdElzBCDb4ZjT7mG6C9df7VIxaBBsVrajTFwKvBShyeAIklolhtb74wwi1jPxWf

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ezt; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA ezt;


ALTER SCHEMA ezt OWNER TO postgres;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: ezt; Owner: postgres
--

CREATE FUNCTION ezt.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION ezt.update_updated_at_column() OWNER TO postgres;

--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_timestamp() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: screens; Type: TABLE; Schema: ezt; Owner: postgres
--

CREATE TABLE ezt.screens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    cinema_id uuid,
    name character varying(100) NOT NULL,
    screen_type character varying(50) DEFAULT 'regular'::character varying,
    total_seats integer NOT NULL,
    seat_layout jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE ezt.screens OWNER TO postgres;

--
-- Name: seat_bookings; Type: TABLE; Schema: ezt; Owner: postgres
--

CREATE TABLE ezt.seat_bookings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    show_id uuid,
    seat_id uuid,
    booking_id uuid,
    user_id uuid,
    status character varying(20) DEFAULT 'selected'::character varying,
    locked_at timestamp without time zone,
    locked_until timestamp without time zone,
    booked_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE ezt.seat_bookings OWNER TO postgres;

--
-- Name: seats; Type: TABLE; Schema: ezt; Owner: postgres
--

CREATE TABLE ezt.seats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    screen_id uuid,
    row_label character varying(5) NOT NULL,
    seat_number integer NOT NULL,
    seat_type character varying(50) DEFAULT 'regular'::character varying,
    price_tier character varying(50),
    is_available boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE ezt.seats OWNER TO postgres;

--
-- Name: shows; Type: TABLE; Schema: ezt; Owner: postgres
--

CREATE TABLE ezt.shows (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    movie_id uuid,
    screen_id uuid,
    cinema_id uuid,
    show_date date NOT NULL,
    show_time time without time zone NOT NULL,
    format character varying(50),
    language character varying(50),
    base_price numeric(10,2) NOT NULL,
    price_tiers jsonb,
    available_seats integer NOT NULL,
    status character varying(20) DEFAULT 'upcoming'::character varying,
    booking_open_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE ezt.shows OWNER TO postgres;

--
-- Name: available_seats_by_show; Type: VIEW; Schema: ezt; Owner: postgres
--

CREATE VIEW ezt.available_seats_by_show AS
 SELECT s.id AS show_id,
    count(se.id) FILTER (WHERE ((sb.status IS NULL) OR ((sb.status)::text = 'released'::text))) AS available_count,
    count(se.id) FILTER (WHERE ((sb.status)::text = 'booked'::text)) AS booked_count,
    count(se.id) FILTER (WHERE (((sb.status)::text = 'locked'::text) AND (sb.locked_until > now()))) AS locked_count
   FROM (((ezt.shows s
     JOIN ezt.screens sc ON ((sc.id = s.screen_id)))
     LEFT JOIN ezt.seats se ON ((se.screen_id = sc.id)))
     LEFT JOIN ezt.seat_bookings sb ON (((sb.seat_id = se.id) AND (sb.show_id = s.id))))
  GROUP BY s.id;


ALTER VIEW ezt.available_seats_by_show OWNER TO postgres;

--
-- Name: cinemas; Type: TABLE; Schema: ezt; Owner: postgres
--

CREATE TABLE ezt.cinemas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    partner_id uuid,
    name character varying(255) NOT NULL,
    address text NOT NULL,
    city character varying(100) NOT NULL,
    state character varying(100),
    pincode character varying(10),
    latitude numeric(10,8),
    longitude numeric(11,8),
    facilities jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE ezt.cinemas OWNER TO postgres;

--
-- Name: movies; Type: TABLE; Schema: ezt; Owner: postgres
--

CREATE TABLE ezt.movies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    genre character varying(100)[],
    duration_minutes integer NOT NULL,
    language character varying(50)[],
    format character varying(50)[],
    rating character varying(10),
    release_date date NOT NULL,
    poster_url text,
    trailer_url text,
    movie_cast jsonb,
    movie_crew jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE ezt.movies OWNER TO postgres;

--
-- Name: shows_with_details; Type: VIEW; Schema: ezt; Owner: postgres
--

CREATE VIEW ezt.shows_with_details AS
 SELECT s.id,
    s.movie_id,
    s.screen_id,
    s.cinema_id,
    s.show_date,
    s.show_time,
    s.format,
    s.language,
    s.base_price,
    s.price_tiers,
    s.available_seats,
    s.status,
    s.booking_open_at,
    s.created_at,
    s.updated_at,
    m.title AS movie_title,
    m.poster_url AS movie_poster,
    m.rating AS movie_rating,
    m.duration_minutes,
    c.name AS cinema_name,
    c.address AS cinema_address,
    c.city,
    sc.name AS screen_name,
    sc.screen_type
   FROM (((ezt.shows s
     JOIN ezt.movies m ON ((m.id = s.movie_id)))
     JOIN ezt.cinemas c ON ((c.id = s.cinema_id)))
     JOIN ezt.screens sc ON ((sc.id = s.screen_id)));


ALTER VIEW ezt.shows_with_details OWNER TO postgres;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    icon_url character varying(500),
    badge_type character varying(50),
    category_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.achievements OWNER TO postgres;

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_name character varying(100) NOT NULL,
    secret_key character varying(500) NOT NULL,
    is_active boolean DEFAULT true,
    last_used timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone
);


ALTER TABLE public.api_keys OWNER TO postgres;

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    professional_id uuid NOT NULL,
    service_id uuid,
    appointment_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    total_amount numeric(10,2) NOT NULL,
    discount_amount numeric(10,2) DEFAULT 0,
    final_amount numeric(10,2) NOT NULL,
    notes text,
    cancellation_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.appointments OWNER TO postgres;

--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    approver_id uuid,
    request_type character varying(50) NOT NULL,
    request_data jsonb NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    approval_notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    approved_by uuid,
    approved_at timestamp without time zone,
    comments text,
    CONSTRAINT approval_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'escalated'::character varying])::text[])))
);


ALTER TABLE public.approval_requests OWNER TO postgres;

--
-- Name: approval_workflows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.approval_workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    workflow_type character varying(50) NOT NULL,
    trigger_level integer NOT NULL,
    approval_level integer NOT NULL,
    auto_approve_conditions jsonb,
    escalation_rules jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT approval_workflows_workflow_type_check CHECK (((workflow_type)::text = ANY ((ARRAY['menu_change'::character varying, 'pricing_change'::character varying, 'offer_creation'::character varying, 'brand_customization'::character varying])::text[])))
);


ALTER TABLE public.approval_workflows OWNER TO postgres;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    actor_role text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    meta jsonb,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(255) NOT NULL,
    resource_type character varying(100),
    resource_id character varying(255),
    old_value jsonb,
    new_value jsonb,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: beverage_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.beverage_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    slug character varying(50) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    icon character varying(100)
);


ALTER TABLE public.beverage_categories OWNER TO postgres;

--
-- Name: TABLE beverage_categories; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.beverage_categories IS 'Beverage type categorization (Alcoholic/Non-Alcoholic)';


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid,
    num_tickets integer,
    partner_id uuid,
    booking_date date,
    booking_time time without time zone,
    num_guests integer,
    table_preference character varying(100),
    booking_type character varying(20) DEFAULT 'event'::character varying,
    total_price numeric(10,2),
    special_requests text,
    status character varying(20) DEFAULT 'pending'::character varying,
    booking_reference character varying(50),
    confirmed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    cancellation_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_pre_order boolean DEFAULT false,
    pre_order_items jsonb,
    deal_id uuid,
    slot_id uuid,
    fiat_amount numeric(12,2) DEFAULT 0,
    ezt_redeemed numeric(15,5) DEFAULT 0,
    reward_eligible boolean DEFAULT false,
    reward_credited boolean DEFAULT false,
    show_id uuid,
    seat_ids uuid[],
    cinema_name character varying(255),
    screen_name character varying(100),
    movie_title character varying(255),
    CONSTRAINT bookings_booking_type_check CHECK (((booking_type)::text = ANY ((ARRAY['event'::character varying, 'restaurant'::character varying])::text[]))),
    CONSTRAINT bookings_num_guests_check CHECK ((num_guests > 0)),
    CONSTRAINT bookings_num_tickets_check CHECK ((num_tickets > 0)),
    CONSTRAINT bookings_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'refunded'::character varying])::text[]))),
    CONSTRAINT check_booking_target CHECK ((((event_id IS NOT NULL) AND (partner_id IS NULL)) OR ((event_id IS NULL) AND (partner_id IS NOT NULL))))
);


ALTER TABLE public.bookings OWNER TO postgres;

--
-- Name: COLUMN bookings.is_pre_order; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bookings.is_pre_order IS 'Indicates if this booking includes a pre-order (Echelon tier only)';


--
-- Name: COLUMN bookings.pre_order_items; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bookings.pre_order_items IS 'JSON array of pre-ordered menu items with quantities and prices';


--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    icon_url character varying(500),
    is_active boolean DEFAULT false,
    launch_date timestamp without time zone,
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: check_ins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.check_ins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    category_id uuid NOT NULL,
    nfc_tag_id character varying(255),
    check_in_token character varying(500),
    latitude numeric(10,8),
    longitude numeric(11,8),
    check_in_method character varying(50),
    status character varying(50) DEFAULT 'active'::character varying,
    transaction_id uuid,
    checked_in_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    checked_out_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.check_ins OWNER TO postgres;

--
-- Name: compliance_audits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compliance_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    store_id uuid,
    standard_id uuid NOT NULL,
    auditor_id uuid,
    audit_date date NOT NULL,
    compliance_score integer,
    findings jsonb,
    recommendations text,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT compliance_audits_compliance_score_check CHECK (((compliance_score >= 0) AND (compliance_score <= 100))),
    CONSTRAINT compliance_audits_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'passed'::character varying, 'failed'::character varying, 'needs_improvement'::character varying])::text[])))
);


ALTER TABLE public.compliance_audits OWNER TO postgres;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    date_of_birth date,
    gender character varying(10),
    address text,
    city character varying(100),
    pincode character varying(10),
    profile_image_url character varying(500),
    is_active boolean DEFAULT true,
    email_verified boolean DEFAULT false,
    phone_verified boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: deal_slots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deal_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    date date NOT NULL,
    time_slot character varying(20),
    capacity integer DEFAULT 0 NOT NULL,
    booked integer DEFAULT 0,
    price numeric(10,2),
    is_available boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.deal_slots OWNER TO postgres;

--
-- Name: dish_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dish_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    slug character varying(50) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    icon character varying(100)
);


ALTER TABLE public.dish_categories OWNER TO postgres;

--
-- Name: TABLE dish_categories; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.dish_categories IS 'Dish type categorization (Veg/Non-Veg)';


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    token character varying(500) NOT NULL,
    purpose character varying(50) DEFAULT 'email_verification'::character varying,
    is_used boolean DEFAULT false,
    used_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.email_verification_tokens OWNER TO postgres;

--
-- Name: event_attributes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_attributes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    attribute_type character varying(50) NOT NULL,
    attribute_value character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.event_attributes OWNER TO postgres;

--
-- Name: event_bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    num_tickets integer NOT NULL,
    total_price numeric(10,2) NOT NULL,
    booking_reference character varying(50) NOT NULL,
    special_requests text,
    status character varying(20) DEFAULT 'pending'::character varying,
    confirmed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    cancellation_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    payment_status character varying(20) DEFAULT 'unpaid'::character varying,
    payment_method character varying(50),
    payment_id character varying(255),
    qr_code text,
    checked_in_at timestamp without time zone,
    CONSTRAINT event_bookings_num_tickets_check CHECK ((num_tickets > 0)),
    CONSTRAINT event_bookings_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['unpaid'::character varying, 'paid'::character varying, 'refunded'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT event_bookings_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'completed'::character varying, 'refunded'::character varying])::text[])))
);


ALTER TABLE public.event_bookings OWNER TO postgres;

--
-- Name: TABLE event_bookings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.event_bookings IS 'Stores event bookings from menu items';


--
-- Name: COLUMN event_bookings.booking_reference; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.event_bookings.booking_reference IS 'Unique booking reference number';


--
-- Name: COLUMN event_bookings.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.event_bookings.status IS 'Booking status: pending, confirmed, cancelled, refunded';


--
-- Name: event_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    icon character varying(100),
    color character varying(7),
    parent_category_id uuid,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.event_categories OWNER TO postgres;

--
-- Name: TABLE event_categories; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.event_categories IS 'Primary event classification categories';


--
-- Name: event_subcategories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_subcategories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.event_subcategories OWNER TO postgres;

--
-- Name: TABLE event_subcategories; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.event_subcategories IS 'Secondary classification within categories';


--
-- Name: event_tag_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_tag_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.event_tag_mappings OWNER TO postgres;

--
-- Name: event_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(100) NOT NULL,
    tag_type character varying(50) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.event_tags OWNER TO postgres;

--
-- Name: TABLE event_tags; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.event_tags IS 'Tertiary classification tags for specific features and themes';


--
-- Name: event_tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid,
    ticket_code character varying(100) NOT NULL,
    qr_code text,
    attendee_name character varying(255) NOT NULL,
    attendee_email character varying(255) NOT NULL,
    attendee_phone character varying(20),
    price_paid numeric(10,2) DEFAULT 0,
    payment_method character varying(50) DEFAULT 'online'::character varying,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    status character varying(50) DEFAULT 'active'::character varying,
    checked_in_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_tickets OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    venue_id uuid,
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    is_complimentary boolean DEFAULT false,
    booking_cap integer,
    seats_booked integer DEFAULT 0,
    price_per_ticket numeric(10,2) DEFAULT 0,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    image_url character varying(500)
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: COLUMN events.is_complimentary; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.is_complimentary IS 'If true, event is free (first-come, first-served)';


--
-- Name: COLUMN events.booking_cap; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.booking_cap IS 'Maximum number of tickets/seats available';


--
-- Name: COLUMN events.seats_booked; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.seats_booked IS 'Current number of seats booked';


--
-- Name: food_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.food_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    icon character varying(100),
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.food_categories OWNER TO postgres;

--
-- Name: food_menu_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.food_menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    display_order integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.food_menu_categories OWNER TO postgres;

--
-- Name: TABLE food_menu_categories; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.food_menu_categories IS 'Main food categories for restaurant menus (Starters, Main Course, etc.)';


--
-- Name: health_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.health_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    professional_id uuid,
    record_type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    diagnosis text,
    treatment_plan text,
    prescription text,
    attachments jsonb,
    record_date date NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.health_records OWNER TO postgres;

--
-- Name: localization_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.localization_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    store_id uuid,
    language character varying(10) DEFAULT 'en'::character varying,
    currency character varying(10) DEFAULT 'INR'::character varying,
    timezone character varying(50) DEFAULT 'Asia/Kolkata'::character varying,
    date_format character varying(20) DEFAULT 'DD/MM/YYYY'::character varying,
    cultural_preferences jsonb,
    local_customizations jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.localization_settings OWNER TO postgres;

--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    category character varying(100),
    is_available boolean DEFAULT true,
    image_url character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    service_category_id uuid,
    duration_minutes integer,
    max_capacity integer,
    requires_booking boolean DEFAULT false,
    service_type character varying(50) DEFAULT 'food'::character varying,
    event_date date,
    event_time time without time zone,
    organizer_name character varying(255),
    venue_name character varying(255),
    food_category_id uuid,
    dish_category_id uuid,
    beverage_category_id uuid,
    preparation_time integer DEFAULT 15,
    spice_level integer DEFAULT 1,
    is_chef_special boolean DEFAULT false,
    allergens text[],
    nutritional_info jsonb,
    is_on_offer boolean DEFAULT false,
    offer_price numeric(10,2),
    offer_discount_percentage numeric(5,2),
    offer_description text,
    offer_start_date date,
    offer_end_date date,
    minimum_order_amount numeric(10,2),
    is_trending boolean DEFAULT false,
    movie_screen_id uuid,
    CONSTRAINT check_offer_dates CHECK (((NOT is_on_offer) OR ((offer_start_date IS NULL) OR (offer_end_date IS NULL) OR (offer_start_date <= offer_end_date)))),
    CONSTRAINT check_offer_price CHECK (((NOT is_on_offer) OR (is_on_offer AND (offer_price IS NOT NULL) AND (offer_price < price)) OR (is_on_offer AND (offer_discount_percentage IS NOT NULL) AND (offer_discount_percentage > (0)::numeric) AND (offer_discount_percentage < (100)::numeric)))),
    CONSTRAINT menu_items_spice_level_check CHECK (((spice_level >= 1) AND (spice_level <= 5))),
    CONSTRAINT offer_dates_check CHECK (((NOT is_on_offer) OR (offer_end_date IS NULL) OR (offer_end_date >= offer_start_date))),
    CONSTRAINT offer_percentage_check CHECK (((NOT is_on_offer) OR (offer_discount_percentage IS NULL) OR ((offer_discount_percentage >= (0)::numeric) AND (offer_discount_percentage <= (100)::numeric)))),
    CONSTRAINT offer_price_check CHECK (((NOT is_on_offer) OR (offer_price IS NULL) OR (offer_price < price)))
);


ALTER TABLE public.menu_items OWNER TO postgres;

--
-- Name: COLUMN menu_items.is_on_offer; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.menu_items.is_on_offer IS 'Indicates if this menu item is currently on offer';


--
-- Name: COLUMN menu_items.offer_price; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.menu_items.offer_price IS 'Discounted price when on offer';


--
-- Name: COLUMN menu_items.offer_discount_percentage; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.menu_items.offer_discount_percentage IS 'Percentage discount (e.g., 10.00 for 10%)';


--
-- Name: COLUMN menu_items.offer_description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.menu_items.offer_description IS 'Description of the offer';


--
-- Name: COLUMN menu_items.offer_start_date; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.menu_items.offer_start_date IS 'Offer validity start date';


--
-- Name: COLUMN menu_items.offer_end_date; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.menu_items.offer_end_date IS 'Offer validity end date';


--
-- Name: COLUMN menu_items.minimum_order_amount; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.menu_items.minimum_order_amount IS 'Minimum order amount required to avail this offer';


--
-- Name: offer_schedule_days; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offer_schedule_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offer_schedule_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    CONSTRAINT offer_schedule_days_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


ALTER TABLE public.offer_schedule_days OWNER TO postgres;

--
-- Name: TABLE offer_schedule_days; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.offer_schedule_days IS 'Day-wise and time-wise rules for each offer';


--
-- Name: offer_schedule_menu_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offer_schedule_menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offer_schedule_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    discount_override numeric(10,2),
    is_required boolean DEFAULT false
);


ALTER TABLE public.offer_schedule_menu_items OWNER TO postgres;

--
-- Name: TABLE offer_schedule_menu_items; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.offer_schedule_menu_items IS 'Granular dish selection for each offer';


--
-- Name: offer_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offer_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    offer_type character varying(50) NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    minimum_order_amount numeric(10,2) DEFAULT 0,
    max_uses_per_customer integer,
    total_max_uses integer,
    is_active boolean DEFAULT true,
    start_date date,
    end_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT offer_schedules_offer_type_check CHECK (((offer_type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed_amount'::character varying, 'buy_x_get_y'::character varying])::text[])))
);


ALTER TABLE public.offer_schedules OWNER TO postgres;

--
-- Name: TABLE offer_schedules; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.offer_schedules IS 'Master offer schedules for partners with complex rules';


--
-- Name: offer_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offer_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offer_schedule_id uuid NOT NULL,
    user_id uuid NOT NULL,
    transaction_id uuid,
    discount_applied numeric(10,2),
    used_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.offer_usage OWNER TO postgres;

--
-- Name: TABLE offer_usage; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.offer_usage IS 'Track offer redemptions for analytics and limits';


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    customer_name character varying(255) NOT NULL,
    customer_email character varying(255),
    customer_phone character varying(20),
    order_items jsonb NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: otp_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otp_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number character varying(20) NOT NULL,
    country_code character varying(5) NOT NULL,
    otp_hash character varying(255),
    purpose character varying(50) NOT NULL,
    verified_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    verified boolean DEFAULT false,
    attempts integer DEFAULT 0,
    used_for_registration boolean DEFAULT false,
    CONSTRAINT otp_attempts_check CHECK ((attempts <= 5))
);


ALTER TABLE public.otp_sessions OWNER TO postgres;

--
-- Name: COLUMN otp_sessions.used_for_registration; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.otp_sessions.used_for_registration IS 'Tracks if OTP was used for user registration to prevent reuse';


--
-- Name: partner_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    store_id uuid,
    metric_type character varying(50) NOT NULL,
    metric_data jsonb NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    aggregation_level character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT partner_analytics_aggregation_level_check CHECK (((aggregation_level)::text = ANY ((ARRAY['store'::character varying, 'regional'::character varying, 'national'::character varying, 'corporate'::character varying])::text[])))
);


ALTER TABLE public.partner_analytics OWNER TO postgres;

--
-- Name: partner_auth; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_auth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.partner_auth OWNER TO postgres;

--
-- Name: partner_category_metadata; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_category_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    category_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.partner_category_metadata OWNER TO postgres;

--
-- Name: partner_hours; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    opens_at time without time zone,
    closes_at time without time zone,
    is_closed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.partner_hours OWNER TO postgres;

--
-- Name: partner_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    image_url character varying(500) NOT NULL,
    image_type character varying(50),
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.partner_images OWNER TO postgres;

--
-- Name: partner_offers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    discount_percentage numeric(5,2),
    discount_amount numeric(10,2),
    original_price numeric(10,2),
    discounted_price numeric(10,2),
    offer_type character varying(50) DEFAULT 'percentage'::character varying,
    terms_conditions text,
    image_url character varying(500),
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true,
    is_trending boolean DEFAULT false,
    max_redemptions integer,
    current_redemptions integer DEFAULT 0,
    applicable_categories jsonb,
    min_purchase_amount numeric(10,2),
    promo_code character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    service_type character varying(50),
    applicable_days text[],
    is_promoted boolean DEFAULT false,
    featured_request_pending boolean DEFAULT false,
    forced_by_admin boolean DEFAULT false,
    menu_item_id uuid,
    applicable_menu_items uuid[],
    discount_applies_to character varying(50) DEFAULT 'standalone'::character varying,
    savings numeric(10,2) DEFAULT 0,
    ezt_equivalent numeric(10,2) DEFAULT 0,
    CONSTRAINT partner_offers_discount_applies_to_check CHECK (((discount_applies_to)::text = ANY ((ARRAY['standalone'::character varying, 'menu_item'::character varying, 'menu_items'::character varying, 'category'::character varying, 'service_type'::character varying])::text[])))
);


ALTER TABLE public.partner_offers OWNER TO postgres;

--
-- Name: partner_organizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    parent_org_id uuid,
    tier_level integer DEFAULT 1,
    organization_code character varying(50),
    description text,
    address jsonb,
    contact_info jsonb,
    business_license character varying(255),
    tax_id character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT partner_organizations_tier_level_check CHECK (((tier_level >= 1) AND (tier_level <= 5))),
    CONSTRAINT partner_organizations_type_check CHECK (((type)::text = ANY ((ARRAY['standalone'::character varying, 'chain'::character varying, 'franchise'::character varying, 'corporate'::character varying])::text[])))
);


ALTER TABLE public.partner_organizations OWNER TO postgres;

--
-- Name: partner_otps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    otp character varying(6) NOT NULL,
    type character varying(50) DEFAULT 'password_recovery'::character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    is_used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.partner_otps OWNER TO postgres;

--
-- Name: partner_stores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_stores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    parent_store_id uuid,
    store_name character varying(255) NOT NULL,
    store_code character varying(50) NOT NULL,
    store_type character varying(50) DEFAULT 'standalone'::character varying,
    address jsonb NOT NULL,
    contact_info jsonb,
    local_manager_id uuid,
    opening_date date,
    closing_date date,
    store_hours jsonb,
    capacity integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT partner_stores_store_type_check CHECK (((store_type)::text = ANY ((ARRAY['standalone'::character varying, 'chain_store'::character varying, 'franchise_store'::character varying])::text[])))
);


ALTER TABLE public.partner_stores OWNER TO postgres;

--
-- Name: partner_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partner_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_type character varying(50) NOT NULL,
    permissions jsonb,
    access_level integer DEFAULT 1,
    can_create_sub_orgs boolean DEFAULT false,
    can_approve_changes boolean DEFAULT false,
    budget_limit numeric(15,2),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    email character varying(255),
    first_name character varying(100),
    last_name character varying(100),
    CONSTRAINT partner_users_access_level_check CHECK (((access_level >= 1) AND (access_level <= 5))),
    CONSTRAINT partner_users_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['store_manager'::character varying, 'regional_manager'::character varying, 'franchise_owner'::character varying, 'corporate_admin'::character varying, 'chain_owner'::character varying, 'area_manager'::character varying])::text[])))
);


ALTER TABLE public.partner_users OWNER TO postgres;

--
-- Name: partners; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category_id uuid NOT NULL,
    address text,
    latitude numeric(10,8) DEFAULT 0,
    longitude numeric(11,8) DEFAULT 0,
    phone_number character varying(20),
    website_url character varying(500),
    email character varying(255),
    partner_discount_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    nfc_tag_id character varying(255),
    partner_category_type character varying(100),
    rating numeric(3,2),
    review_count integer DEFAULT 0,
    partner_code character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    approved_for_featured boolean DEFAULT false
);


ALTER TABLE public.partners OWNER TO postgres;

--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    payment_type character varying(50) NOT NULL,
    token_reference character varying(500),
    last_four character varying(4),
    card_brand character varying(50),
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payment_methods OWNER TO postgres;

--
-- Name: pre_order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pre_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pre_order_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    special_instructions text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT pre_order_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.pre_order_items OWNER TO postgres;

--
-- Name: TABLE pre_order_items; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.pre_order_items IS 'Individual items in pre-orders';


--
-- Name: pre_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pre_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    reservation_id uuid,
    order_date date NOT NULL,
    order_time time without time zone NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    special_instructions text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT pre_orders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'preparing'::character varying, 'ready'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.pre_orders OWNER TO postgres;

--
-- Name: TABLE pre_orders; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.pre_orders IS 'Pre-order system for Echelon tier reservations';


--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.prescriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid NOT NULL,
    professional_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    diagnosis text,
    symptoms text,
    medications jsonb,
    instructions text,
    follow_up_date date,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.prescriptions OWNER TO postgres;

--
-- Name: professionals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.professionals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20) NOT NULL,
    specialization character varying(200),
    experience_years integer,
    qualifications text,
    bio text,
    profile_image_url character varying(500),
    consultation_fee numeric(10,2),
    rating numeric(3,2) DEFAULT 0.0,
    total_reviews integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.professionals OWNER TO postgres;

--
-- Name: quality_standards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quality_standards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    standard_type character varying(50) NOT NULL,
    standard_name character varying(255) NOT NULL,
    standard_description text,
    compliance_requirements jsonb,
    audit_frequency character varying(50),
    is_mandatory boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT quality_standards_standard_type_check CHECK (((standard_type)::text = ANY ((ARRAY['service'::character varying, 'food_safety'::character varying, 'branding'::character varying, 'customer_experience'::character varying])::text[])))
);


ALTER TABLE public.quality_standards OWNER TO postgres;

--
-- Name: referral_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.referral_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    bonus_tokens numeric(15,5) DEFAULT 250,
    max_uses integer,
    current_uses integer DEFAULT 0,
    is_active boolean DEFAULT true,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.referral_codes OWNER TO postgres;

--
-- Name: referrals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referred_user_id uuid NOT NULL,
    referral_code_id uuid NOT NULL,
    bonus_credited_to_referrer boolean DEFAULT false,
    bonus_credited_to_referred boolean DEFAULT false,
    referrer_bonus numeric(15,5) DEFAULT 250,
    referred_bonus numeric(15,5) DEFAULT 250,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.referrals OWNER TO postgres;

--
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    professional_id uuid,
    service_id uuid,
    appointment_id uuid,
    rating integer NOT NULL,
    review_text text,
    is_verified boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_name character varying(50) NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: screens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.screens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    theatre_id uuid NOT NULL,
    partner_id uuid,
    name character varying(255) NOT NULL,
    total_seats integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.screens OWNER TO postgres;

--
-- Name: service_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    icon character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    display_order integer DEFAULT 0
);


ALTER TABLE public.service_categories OWNER TO postgres;

--
-- Name: service_subcategories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_subcategories (
    id integer NOT NULL,
    service_type character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    iso_reference character varying(50),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.service_subcategories OWNER TO postgres;

--
-- Name: service_subcategories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.service_subcategories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.service_subcategories_id_seq OWNER TO postgres;

--
-- Name: service_subcategories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.service_subcategories_id_seq OWNED BY public.service_subcategories.id;


--
-- Name: standardization_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.standardization_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    template_type character varying(50) NOT NULL,
    template_name character varying(255) NOT NULL,
    template_data jsonb NOT NULL,
    is_mandatory boolean DEFAULT false,
    can_be_customized boolean DEFAULT true,
    customization_rules jsonb,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    CONSTRAINT standardization_templates_template_type_check CHECK (((template_type)::text = ANY ((ARRAY['menu'::character varying, 'pricing'::character varying, 'offers'::character varying, 'branding'::character varying, 'policies'::character varying])::text[])))
);


ALTER TABLE public.standardization_templates OWNER TO postgres;

--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject character varying(255) NOT NULL,
    description text NOT NULL,
    category_id uuid,
    status character varying(50) DEFAULT 'open'::character varying,
    priority character varying(50) DEFAULT 'medium'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp without time zone
);


ALTER TABLE public.support_tickets OWNER TO postgres;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.system_settings OWNER TO postgres;

--
-- Name: theatres; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.theatres (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    address jsonb DEFAULT '{}'::jsonb,
    city character varying(120) NOT NULL,
    state character varying(120),
    country character varying(120) DEFAULT 'India'::character varying,
    timezone character varying(60) DEFAULT 'Asia/Kolkata'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.theatres OWNER TO postgres;

--
-- Name: tier_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tier_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    current_tier_id uuid NOT NULL,
    previous_tier_id uuid,
    total_spend numeric(12,2) DEFAULT 0,
    progress_percentage numeric(5,2) DEFAULT 0,
    promoted_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tier_progress OWNER TO postgres;

--
-- Name: tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    level integer NOT NULL,
    token_earning_percentage numeric(5,2) NOT NULL,
    min_spend_required numeric(12,2) DEFAULT 0,
    description text,
    color_code character varying(7),
    icon_url character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tiers OWNER TO postgres;

--
-- Name: time_slots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.time_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    professional_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.time_slots OWNER TO postgres;

--
-- Name: token_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.token_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    transaction_id uuid,
    amount numeric(15,5) NOT NULL,
    ledger_type character varying(50) NOT NULL,
    balance_before numeric(15,5) NOT NULL,
    balance_after numeric(15,5) NOT NULL,
    category_id uuid,
    description text,
    reference_id character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.token_ledger OWNER TO postgres;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    category_id uuid NOT NULL,
    check_in_id uuid,
    bill_amount numeric(12,2) NOT NULL,
    discount_percentage numeric(5,2) NOT NULL,
    discount_amount numeric(12,2) NOT NULL,
    amount_after_discount numeric(12,2) NOT NULL,
    tokens_redeemed numeric(15,5) DEFAULT 0,
    tokens_earned numeric(15,5) DEFAULT 0,
    net_token_change numeric(15,5),
    user_tier_at_transaction uuid,
    transaction_type character varying(50) DEFAULT 'purchase'::character varying,
    payment_source character varying(50) DEFAULT 'app2'::character varying,
    payment_method character varying(100),
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    app2_transaction_id character varying(255),
    webhook_signature character varying(512),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    achievement_id uuid NOT NULL,
    achieved_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_achievements OWNER TO postgres;

--
-- Name: user_auth_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_auth_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    password_hash character varying(255) NOT NULL,
    phone_verified boolean DEFAULT false,
    email_verified boolean DEFAULT false,
    phone_verified_at timestamp without time zone,
    email_verified_at timestamp without time zone,
    last_password_change timestamp without time zone,
    password_reset_token character varying(500),
    password_reset_expires timestamp without time zone,
    failed_login_attempts integer DEFAULT 0,
    account_locked_until timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_auth_credentials OWNER TO postgres;

--
-- Name: user_category_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_category_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    is_interested boolean DEFAULT false,
    notification_enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_category_preferences OWNER TO postgres;

--
-- Name: user_partner_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_partner_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    category_id uuid NOT NULL,
    is_connected boolean DEFAULT true,
    favorite boolean DEFAULT false,
    total_visits integer DEFAULT 0,
    total_spend numeric(12,2) DEFAULT 0,
    last_visit timestamp without time zone,
    connected_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_partner_connections OWNER TO postgres;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token character varying(1024) NOT NULL,
    refresh_token character varying(1024) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    device_id character varying(255),
    device_name character varying(255),
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_sessions OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number character varying(20) NOT NULL,
    country_code character varying(5) DEFAULT '+91'::character varying NOT NULL,
    email character varying(255),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    profile_photo_url character varying(500),
    address text,
    city character varying(100),
    state_province character varying(100),
    country character varying(100),
    postal_code character varying(20),
    date_of_birth date,
    gender character varying(20),
    anniversary_date date,
    current_tier_id uuid NOT NULL,
    total_tokens_earned numeric(15,5) DEFAULT 0,
    total_tokens_spent numeric(15,5) DEFAULT 0,
    available_tokens numeric(15,5) DEFAULT 0,
    total_spend numeric(12,2) DEFAULT 0,
    firebase_uid character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone,
    signup_bonus_credited boolean DEFAULT false,
    role_id uuid DEFAULT 'd453cecd-2904-4e79-80d7-637f9195a6e1'::uuid NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    event_id uuid,
    partner_id uuid NOT NULL,
    code character varying(100) NOT NULL,
    qr_code_url character varying(500),
    qr_code_data text,
    status character varying(50) DEFAULT 'active'::character varying,
    redeemed_by_partner_id uuid,
    redeemed_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vouchers_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'redeemed'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.vouchers OWNER TO postgres;

--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(100) NOT NULL,
    source_app character varying(50),
    category_id uuid,
    payload jsonb NOT NULL,
    signature character varying(512),
    is_verified boolean DEFAULT false,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    retry_count integer DEFAULT 0,
    received_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp without time zone
);


ALTER TABLE public.webhook_logs OWNER TO postgres;

--
-- Name: service_subcategories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_subcategories ALTER COLUMN id SET DEFAULT nextval('public.service_subcategories_id_seq'::regclass);


--
-- Data for Name: cinemas; Type: TABLE DATA; Schema: ezt; Owner: postgres
--

COPY ezt.cinemas (id, partner_id, name, address, city, state, pincode, latitude, longitude, facilities, is_active, created_at, updated_at) FROM stdin;
956ecef2-1ae8-4dd7-8920-704f82e3ee59	00993477-9d54-4288-81a2-86f684a49329	PVR Cinemas Saket	Select Citywalk Mall, Saket	New Delhi	Delhi	110017	28.52440000	77.20660000	[{"type": "parking"}, {"type": "food_court"}, {"type": "wheelchair"}]	t	2025-11-16 11:10:24.155517	2025-11-16 11:10:24.155517
f672eae9-bd8b-46c3-9475-d26fde882f06	00993477-9d54-4288-81a2-86f684a49329	PVR Cinemas Saket	Select Citywalk Mall, Saket	New Delhi	Delhi	110017	28.52440000	77.20660000	[{"type": "parking"}, {"type": "food_court"}, {"type": "wheelchair"}]	t	2025-11-16 11:11:31.803003	2025-11-16 11:11:31.803003
\.


--
-- Data for Name: movies; Type: TABLE DATA; Schema: ezt; Owner: postgres
--

COPY ezt.movies (id, title, description, genre, duration_minutes, language, format, rating, release_date, poster_url, trailer_url, movie_cast, movie_crew, is_active, created_at, updated_at) FROM stdin;
df96ef30-17f2-461a-a6f3-e7115f093a58	De De Pyaar De	A romantic comedy about love and relationships across generations.	{Comedy,Romance}	147	{Hindi}	{2D}	U/A	2023-02-20	https://example.com/poster.jpg	\N	[]	[]	t	2025-11-16 11:11:31.800222	2025-11-16 11:11:31.800222
\.


--
-- Data for Name: screens; Type: TABLE DATA; Schema: ezt; Owner: postgres
--

COPY ezt.screens (id, cinema_id, name, screen_type, total_seats, seat_layout, is_active, created_at) FROM stdin;
ce756cee-b97c-449c-be0c-b9c8217a6a11	956ecef2-1ae8-4dd7-8920-704f82e3ee59	Screen 1	regular	160	{"rows": ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], "aisles": [8], "seatsPerRow": 16}	t	2025-11-16 11:11:31.805229
\.


--
-- Data for Name: seat_bookings; Type: TABLE DATA; Schema: ezt; Owner: postgres
--

COPY ezt.seat_bookings (id, show_id, seat_id, booking_id, user_id, status, locked_at, locked_until, booked_at, created_at) FROM stdin;
\.


--
-- Data for Name: seats; Type: TABLE DATA; Schema: ezt; Owner: postgres
--

COPY ezt.seats (id, screen_id, row_label, seat_number, seat_type, price_tier, is_available, created_at) FROM stdin;
3b856c74-b055-4ec4-a316-09c72c5905d5	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	1	premium	Gold	t	2025-11-16 11:11:31.805229
63041ea5-df84-4648-b158-f0150068592b	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	2	premium	Gold	t	2025-11-16 11:11:31.805229
6afeb337-cfee-495b-a5f1-409ef5ccee1e	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	3	premium	Gold	t	2025-11-16 11:11:31.805229
7d0281ad-8ce7-4d59-a57d-73b39bd4abf5	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	4	premium	Gold	t	2025-11-16 11:11:31.805229
80d3defc-d574-4253-a454-5c5afd73e055	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	5	premium	Gold	t	2025-11-16 11:11:31.805229
45116501-96b9-4097-a956-dbbd0d5f9963	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	6	premium	Gold	t	2025-11-16 11:11:31.805229
612e431d-a42e-46f6-8b39-bc0df1e04d08	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	7	premium	Gold	t	2025-11-16 11:11:31.805229
6769a9d5-07f9-4f9c-801a-fc5f0a6db0c9	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	8	premium	Gold	t	2025-11-16 11:11:31.805229
9fabcd3e-b204-4f36-aa2f-fc15a7e4ca6d	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	9	premium	Gold	t	2025-11-16 11:11:31.805229
7d565b4e-1239-4a78-b58c-92617c30ed29	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	10	premium	Gold	t	2025-11-16 11:11:31.805229
a12ddc94-9aaf-4638-8977-7c61f55ee10a	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	11	premium	Gold	t	2025-11-16 11:11:31.805229
a724f464-992e-4030-8a72-fab37ae532f9	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	12	premium	Gold	t	2025-11-16 11:11:31.805229
e2dfb77b-32d3-4c9a-8b4e-b76993e5068f	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	13	premium	Gold	t	2025-11-16 11:11:31.805229
8294490d-3c86-4e0c-b912-428835ebfdc4	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	14	premium	Gold	t	2025-11-16 11:11:31.805229
553098ea-bbb1-4f34-b58b-4484b7d26803	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	15	premium	Gold	t	2025-11-16 11:11:31.805229
a7eb9ae8-0a44-4a4b-b29f-8bd1b1b8d262	ce756cee-b97c-449c-be0c-b9c8217a6a11	A	16	premium	Gold	t	2025-11-16 11:11:31.805229
00f1c6c9-8de6-4324-817b-74047db78bfe	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	1	premium	Gold	t	2025-11-16 11:11:31.805229
08c95910-19dc-461a-894b-f66508b10ebc	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	2	premium	Gold	t	2025-11-16 11:11:31.805229
26d5eec9-74bf-4f1c-aeb8-4fed260b2fdf	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	3	premium	Gold	t	2025-11-16 11:11:31.805229
0091d90c-1878-4a74-b299-8ef73a77dd69	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	4	premium	Gold	t	2025-11-16 11:11:31.805229
a41c35c8-28d6-4761-b285-9cb79bb14755	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	5	premium	Gold	t	2025-11-16 11:11:31.805229
eddde7b5-5037-4de8-a3a9-21007517f36d	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	6	premium	Gold	t	2025-11-16 11:11:31.805229
637cc380-8de0-496e-8146-667fea1e0946	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	7	premium	Gold	t	2025-11-16 11:11:31.805229
2b45467e-a730-4108-a521-a6013b79c8ec	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	8	premium	Gold	t	2025-11-16 11:11:31.805229
a073e3ca-bae4-485f-a9fb-da0a2cf1a427	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	9	premium	Gold	t	2025-11-16 11:11:31.805229
7291d130-b153-407f-9f06-39bf2d2d0215	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	10	premium	Gold	t	2025-11-16 11:11:31.805229
6e59f106-7826-4d5a-84be-fa66ae6e17c5	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	11	premium	Gold	t	2025-11-16 11:11:31.805229
04719ac2-4e10-4114-962b-585a4b34f7f1	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	12	premium	Gold	t	2025-11-16 11:11:31.805229
fc00804a-3535-49ef-97c8-44d1cf610e88	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	13	premium	Gold	t	2025-11-16 11:11:31.805229
d57bbc74-84da-49d8-9346-9f2a1cbe363b	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	14	premium	Gold	t	2025-11-16 11:11:31.805229
06192001-9dea-4370-bf5d-2cd09caee0b1	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	15	premium	Gold	t	2025-11-16 11:11:31.805229
ac79f9ce-5072-431e-98fc-42ea2f9a3846	ce756cee-b97c-449c-be0c-b9c8217a6a11	B	16	premium	Gold	t	2025-11-16 11:11:31.805229
31f66b91-7b74-40fb-aa4d-bb69af72eeca	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	1	premium	Gold	t	2025-11-16 11:11:31.805229
0c646486-7ae6-4224-ae14-901259d27748	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	2	premium	Gold	t	2025-11-16 11:11:31.805229
955429bc-acc0-4b17-b19d-73c338041686	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	3	premium	Gold	t	2025-11-16 11:11:31.805229
f49cbc86-9d12-47e2-8f76-dd914dd5c5f4	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	4	premium	Gold	t	2025-11-16 11:11:31.805229
32533563-f371-4578-afe5-fdbf41d61631	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	5	premium	Gold	t	2025-11-16 11:11:31.805229
d2ff1070-5196-4eeb-9ca2-d3560119ca2d	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	6	premium	Gold	t	2025-11-16 11:11:31.805229
72f86863-8ad4-4816-82f8-e4dc5948ab07	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	7	premium	Gold	t	2025-11-16 11:11:31.805229
3b212a34-84ff-4d0d-a61c-857c606387dd	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	8	premium	Gold	t	2025-11-16 11:11:31.805229
57f1f1a3-9ab5-4651-bdc8-0e91727feb74	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	9	premium	Gold	t	2025-11-16 11:11:31.805229
5f0e5e38-a2f0-4e9f-9b43-b108031ad830	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	10	premium	Gold	t	2025-11-16 11:11:31.805229
6f163cae-5023-4530-b863-9ec85dd6962e	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	11	premium	Gold	t	2025-11-16 11:11:31.805229
51219cc8-71d5-498c-a5de-e83676b67399	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	12	premium	Gold	t	2025-11-16 11:11:31.805229
6dc75af5-a152-4ebf-844c-58c40a4b47a0	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	13	premium	Gold	t	2025-11-16 11:11:31.805229
81934b4c-6f85-4a2c-bb26-8dcfa3e08db6	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	14	premium	Gold	t	2025-11-16 11:11:31.805229
95c7c6af-6d4e-45cb-8571-0d3169401cf0	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	15	premium	Gold	t	2025-11-16 11:11:31.805229
961b7573-9b7f-4229-806f-3a3897c43169	ce756cee-b97c-449c-be0c-b9c8217a6a11	C	16	premium	Gold	t	2025-11-16 11:11:31.805229
669642c4-8cb6-4f23-8695-d8e7e7ca1727	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	1	regular	Silver	t	2025-11-16 11:11:31.805229
5127fa17-dc71-45b2-8e63-cd01d3f25784	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	2	regular	Silver	t	2025-11-16 11:11:31.805229
0021a684-efed-4de9-84d6-e8e71f77216e	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	3	regular	Silver	t	2025-11-16 11:11:31.805229
11bb0012-0b22-4bba-a1b3-44076d4f4030	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	4	regular	Silver	t	2025-11-16 11:11:31.805229
ee3bacd9-f52d-40a5-bb15-5c4f61d43522	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	5	regular	Silver	t	2025-11-16 11:11:31.805229
9f1848da-3ad5-4d13-8301-7ad68dcf4abb	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	6	regular	Silver	t	2025-11-16 11:11:31.805229
75bde4c1-7a96-4f11-a27d-fbebeca35bf4	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	7	regular	Silver	t	2025-11-16 11:11:31.805229
9b244752-a263-44bd-9956-a8773e61b2ac	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	8	regular	Silver	t	2025-11-16 11:11:31.805229
5e77337e-29ac-498c-a916-292c156cf460	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	9	regular	Silver	t	2025-11-16 11:11:31.805229
fe18d302-9e8a-40fe-96ef-376fcd780e1d	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	10	regular	Silver	t	2025-11-16 11:11:31.805229
be736731-d3f0-4f9f-bbd9-d579f1f727b1	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	11	regular	Silver	t	2025-11-16 11:11:31.805229
8e3f30d8-9a5b-42b3-9482-63595a7157c6	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	12	regular	Silver	t	2025-11-16 11:11:31.805229
9c406a6e-876c-49bf-816b-5d4b61ed1aa9	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	13	regular	Silver	t	2025-11-16 11:11:31.805229
25baa8e2-543a-414c-859f-697189847c00	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	14	regular	Silver	t	2025-11-16 11:11:31.805229
e873bd45-8cac-4202-8f25-c55a81dd622c	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	15	regular	Silver	t	2025-11-16 11:11:31.805229
7eea6633-11c7-48ac-88bd-a90238a4bd33	ce756cee-b97c-449c-be0c-b9c8217a6a11	D	16	regular	Silver	t	2025-11-16 11:11:31.805229
33117480-7cb0-41d1-a4bb-1ca4445c08e5	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	1	regular	Silver	t	2025-11-16 11:11:31.805229
18351ea3-c7ea-4580-a69d-b686fe221d51	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	2	regular	Silver	t	2025-11-16 11:11:31.805229
bbca5d97-a34a-4809-8a22-9acbb21152ad	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	3	regular	Silver	t	2025-11-16 11:11:31.805229
971979c9-a09b-49e6-a380-0bbf28308050	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	4	regular	Silver	t	2025-11-16 11:11:31.805229
15595cc4-1b60-490a-b811-594521e25b60	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	5	regular	Silver	t	2025-11-16 11:11:31.805229
af5d7c71-195b-4493-baca-5226cff1c7af	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	6	regular	Silver	t	2025-11-16 11:11:31.805229
b29dcfb5-8833-43dc-9f8c-4d00523947a0	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	7	regular	Silver	t	2025-11-16 11:11:31.805229
0b42b287-88b8-4c4d-905c-2f1638855c9a	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	8	regular	Silver	t	2025-11-16 11:11:31.805229
31193754-c708-4bcb-903a-3836ccb7e12d	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	9	regular	Silver	t	2025-11-16 11:11:31.805229
caad3d62-baf0-4370-bec9-603b9613a6e2	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	10	regular	Silver	t	2025-11-16 11:11:31.805229
286e614d-4110-400e-927e-6554ddb51ff0	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	11	regular	Silver	t	2025-11-16 11:11:31.805229
d9bd0d0d-30fd-47ce-9872-a0f453e472b4	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	12	regular	Silver	t	2025-11-16 11:11:31.805229
6c352098-6430-4688-9a13-9ac9bdccdc53	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	13	regular	Silver	t	2025-11-16 11:11:31.805229
d9df3041-14ee-41d4-adcd-e643e63fcad9	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	14	regular	Silver	t	2025-11-16 11:11:31.805229
db51a6e0-85f4-4f13-bcd5-756621630af1	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	15	regular	Silver	t	2025-11-16 11:11:31.805229
43e44288-cd26-4a1d-b263-4493fbea1e62	ce756cee-b97c-449c-be0c-b9c8217a6a11	E	16	regular	Silver	t	2025-11-16 11:11:31.805229
fd461c89-7cf3-447f-ad99-a8132557d548	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	1	regular	Silver	t	2025-11-16 11:11:31.805229
6bb4bf58-26be-4afc-9004-c55ce763cd29	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	2	regular	Silver	t	2025-11-16 11:11:31.805229
08a67750-f2b0-4155-836a-86f29b2b8d96	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	3	regular	Silver	t	2025-11-16 11:11:31.805229
095b5daa-8268-458d-98ad-13f2e374f824	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	4	regular	Silver	t	2025-11-16 11:11:31.805229
e6f9cdcd-b5cf-4760-a066-f32b9e689efd	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	5	regular	Silver	t	2025-11-16 11:11:31.805229
6f5e8532-16be-4bac-806f-50ad6c1ed34e	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	6	regular	Silver	t	2025-11-16 11:11:31.805229
7bd6aeec-3f92-4c61-8bc0-a6bb1bbb1f52	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	7	regular	Silver	t	2025-11-16 11:11:31.805229
70b03b04-a85a-4cd5-ba73-db9bcc40cd14	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	8	regular	Silver	t	2025-11-16 11:11:31.805229
f521ad32-52db-4366-8af6-9f9f77e46447	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	9	regular	Silver	t	2025-11-16 11:11:31.805229
62403f1b-dda0-46eb-9713-5be2f4921651	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	10	regular	Silver	t	2025-11-16 11:11:31.805229
b29e4f6c-a833-4ce2-a8d9-68fac186a6c8	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	11	regular	Silver	t	2025-11-16 11:11:31.805229
bfaf24d1-c22b-4cd3-a50b-3d4e08400bd7	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	12	regular	Silver	t	2025-11-16 11:11:31.805229
0d552d76-3ab4-49e0-910f-51b060d24be0	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	13	regular	Silver	t	2025-11-16 11:11:31.805229
140941e7-3ff2-4475-b5b2-c7828fc082ed	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	14	regular	Silver	t	2025-11-16 11:11:31.805229
e2e13192-caa6-464e-bcce-2b8276cd0b84	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	15	regular	Silver	t	2025-11-16 11:11:31.805229
58458258-250c-400c-99d4-ac66620b96d1	ce756cee-b97c-449c-be0c-b9c8217a6a11	F	16	regular	Silver	t	2025-11-16 11:11:31.805229
eb3c61ef-20a1-46d1-98bd-6af3e8a74bdf	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	1	regular	Silver	t	2025-11-16 11:11:31.805229
5085ee97-75bd-459b-a7d0-288feb860f5b	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	2	regular	Silver	t	2025-11-16 11:11:31.805229
78f81651-da92-417b-8484-0d21af666061	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	3	regular	Silver	t	2025-11-16 11:11:31.805229
ef1baabd-c2d5-40ca-b4bd-11b0f36efdb7	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	4	regular	Silver	t	2025-11-16 11:11:31.805229
f32e0574-67b8-4b10-b3a6-9c90230ad456	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	5	regular	Silver	t	2025-11-16 11:11:31.805229
3ac61cba-595d-4718-9fe3-b72d660399f5	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	6	regular	Silver	t	2025-11-16 11:11:31.805229
76a670fe-2253-43ae-bc55-bf9508238b4f	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	7	regular	Silver	t	2025-11-16 11:11:31.805229
c112b8a2-639e-43b7-9104-050e447179cf	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	8	regular	Silver	t	2025-11-16 11:11:31.805229
e4fbad16-11d9-436f-b0b7-42a437b5f6c0	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	9	regular	Silver	t	2025-11-16 11:11:31.805229
ee0e69de-4691-41d3-a0e8-076bc4266255	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	10	regular	Silver	t	2025-11-16 11:11:31.805229
fe86dce6-d7cf-4741-8234-f970669afe42	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	11	regular	Silver	t	2025-11-16 11:11:31.805229
3e13beff-45d2-428c-9ff4-f396bc20651d	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	12	regular	Silver	t	2025-11-16 11:11:31.805229
a090cc1b-8181-44dc-8ff8-c273a0d6b841	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	13	regular	Silver	t	2025-11-16 11:11:31.805229
5ca38e05-fa12-4b18-97cd-70f20ab50d1d	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	14	regular	Silver	t	2025-11-16 11:11:31.805229
f188b702-d680-4bbf-b362-4955e6fe3202	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	15	regular	Silver	t	2025-11-16 11:11:31.805229
c123c066-ef5e-4d85-b59b-4265696a25f0	ce756cee-b97c-449c-be0c-b9c8217a6a11	G	16	regular	Silver	t	2025-11-16 11:11:31.805229
8d893c6c-9a39-42be-b197-c4c39aba7b1c	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	1	regular	Silver	t	2025-11-16 11:11:31.805229
856e0a9c-7ed9-4acd-852c-2f9efa823dea	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	2	regular	Silver	t	2025-11-16 11:11:31.805229
a2edb5c8-adce-4193-9bfe-5a46219b55a2	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	3	regular	Silver	t	2025-11-16 11:11:31.805229
ecce660e-f3df-499f-8080-2b59a6c6971a	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	4	regular	Silver	t	2025-11-16 11:11:31.805229
cf81b76f-68cc-452d-88ee-e16866720b44	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	5	regular	Silver	t	2025-11-16 11:11:31.805229
0df13399-c824-408d-9545-9faad05fc19e	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	6	regular	Silver	t	2025-11-16 11:11:31.805229
8e2f0901-6dbc-40d8-91d4-3e1d6de200a2	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	7	regular	Silver	t	2025-11-16 11:11:31.805229
da598349-a000-4d98-a5a7-54a9086e84f1	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	8	regular	Silver	t	2025-11-16 11:11:31.805229
51c90896-1100-4af5-bac8-7725aec9e4cd	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	9	regular	Silver	t	2025-11-16 11:11:31.805229
e972b50a-2559-4827-98fd-faf5f76561c3	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	10	regular	Silver	t	2025-11-16 11:11:31.805229
e3835a80-d02f-4ac1-b6e8-90c146f33c68	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	11	regular	Silver	t	2025-11-16 11:11:31.805229
ac1016f2-ed80-4bfd-b636-64ddeab9a1a1	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	12	regular	Silver	t	2025-11-16 11:11:31.805229
2570d61a-8642-44a7-b8e8-de7498bdf0c6	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	13	regular	Silver	t	2025-11-16 11:11:31.805229
fe2d06c8-62f8-49de-8696-91f1eb8786fc	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	14	regular	Silver	t	2025-11-16 11:11:31.805229
1ff348e6-4424-4e81-9a5c-d83ff59fd74b	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	15	regular	Silver	t	2025-11-16 11:11:31.805229
c1936759-e291-4117-91a7-1b84ce20ac51	ce756cee-b97c-449c-be0c-b9c8217a6a11	H	16	regular	Silver	t	2025-11-16 11:11:31.805229
bd29c691-7098-4820-867d-a3a5684a198a	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	1	regular	Silver	t	2025-11-16 11:11:31.805229
334dc39c-81f2-4b7d-bd69-2e624cddcfef	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	2	regular	Silver	t	2025-11-16 11:11:31.805229
d5eedbf0-1e30-4785-a71e-3ba5cd1881cb	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	3	regular	Silver	t	2025-11-16 11:11:31.805229
0671deba-08b9-49a6-847a-a09ff619a8e8	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	4	regular	Silver	t	2025-11-16 11:11:31.805229
26b1d4c0-7d22-4697-9173-22142e094cfa	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	5	regular	Silver	t	2025-11-16 11:11:31.805229
ff4c0747-d5a3-4428-874b-9b6ccacc6b7d	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	6	regular	Silver	t	2025-11-16 11:11:31.805229
a1246004-f5d6-445b-9ec2-5caa44d109b5	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	7	regular	Silver	t	2025-11-16 11:11:31.805229
695c3047-a229-42ec-a11a-5b5954e2f5f9	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	8	regular	Silver	t	2025-11-16 11:11:31.805229
e2641515-9ce7-4880-b51a-c4e58f856b05	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	9	regular	Silver	t	2025-11-16 11:11:31.805229
1009d185-9b49-4980-8d30-cd10538bb06d	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	10	regular	Silver	t	2025-11-16 11:11:31.805229
b8f81ed4-c966-4c51-ac89-97d96bb18ae0	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	11	regular	Silver	t	2025-11-16 11:11:31.805229
5ffc2b2a-8c00-4edd-96ee-a0e41942ea57	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	12	regular	Silver	t	2025-11-16 11:11:31.805229
11212ba8-dae5-472e-96d1-57cf43a59bf8	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	13	regular	Silver	t	2025-11-16 11:11:31.805229
9252508b-7d66-4693-94cd-fcb57c7981df	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	14	regular	Silver	t	2025-11-16 11:11:31.805229
5298a113-50b3-4a75-99b1-145da5ecdf66	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	15	regular	Silver	t	2025-11-16 11:11:31.805229
0cc53d54-f3de-4ee9-bb30-fd1421f9eebc	ce756cee-b97c-449c-be0c-b9c8217a6a11	I	16	regular	Silver	t	2025-11-16 11:11:31.805229
d46fe2aa-e92e-4012-bfe8-1ef1a4fb53ca	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	1	regular	Silver	t	2025-11-16 11:11:31.805229
b38fd9d7-d554-46f3-b165-3de75f2ed552	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	2	regular	Silver	t	2025-11-16 11:11:31.805229
c787bea4-49cf-4e2d-a38e-ae8c92cdf067	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	3	regular	Silver	t	2025-11-16 11:11:31.805229
0a848abd-673d-4403-bda5-c7121d0d563b	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	4	regular	Silver	t	2025-11-16 11:11:31.805229
a0a92fd6-294c-4662-b413-4fe815698033	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	5	regular	Silver	t	2025-11-16 11:11:31.805229
2ab25e59-39c3-45d2-97ad-c9aac83a930f	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	6	regular	Silver	t	2025-11-16 11:11:31.805229
ed1bfd10-4869-49b9-abea-fb390eb8f657	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	7	regular	Silver	t	2025-11-16 11:11:31.805229
ab41ede6-6ed3-424b-91fd-6c7a75b228b8	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	8	regular	Silver	t	2025-11-16 11:11:31.805229
901e3e49-8bea-445e-bfe6-70a931f752ba	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	9	regular	Silver	t	2025-11-16 11:11:31.805229
910ceff6-d669-4b43-9ccf-e22459be396a	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	10	regular	Silver	t	2025-11-16 11:11:31.805229
259b8458-0c78-42d6-aab8-5c7173e97f35	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	11	regular	Silver	t	2025-11-16 11:11:31.805229
95957cae-27f2-4625-bcc5-a6ab59355bcd	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	12	regular	Silver	t	2025-11-16 11:11:31.805229
90205016-4aef-4701-9d6f-ab033a118504	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	13	regular	Silver	t	2025-11-16 11:11:31.805229
43bde79f-af98-4fa1-b0ae-ad62882c8546	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	14	regular	Silver	t	2025-11-16 11:11:31.805229
6b3b1d7d-cab7-48e6-bd00-d343ee63d9dc	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	15	regular	Silver	t	2025-11-16 11:11:31.805229
8c31e12b-def7-43af-9e88-379bc4bc4e93	ce756cee-b97c-449c-be0c-b9c8217a6a11	J	16	regular	Silver	t	2025-11-16 11:11:31.805229
\.


--
-- Data for Name: shows; Type: TABLE DATA; Schema: ezt; Owner: postgres
--

COPY ezt.shows (id, movie_id, screen_id, cinema_id, show_date, show_time, format, language, base_price, price_tiers, available_seats, status, booking_open_at, created_at, updated_at) FROM stdin;
5f95fca8-66ae-447f-87f7-38850b74a913	df96ef30-17f2-461a-a6f3-e7115f093a58	ce756cee-b97c-449c-be0c-b9c8217a6a11	956ecef2-1ae8-4dd7-8920-704f82e3ee59	2025-11-17	18:30:00	2D	Hindi	250.00	[{"tier": "Gold", "price": 350}, {"tier": "Silver", "price": 250}]	160	upcoming	2025-11-16 11:11:31.805229	2025-11-16 11:11:31.805229	2025-11-16 11:11:31.805229
\.


--
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.achievements (id, name, description, icon_url, badge_type, category_id, created_at) FROM stdin;
\.


--
-- Data for Name: api_keys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.api_keys (id, app_name, secret_key, is_active, last_used, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: appointments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.appointments (id, customer_id, professional_id, service_id, appointment_date, start_time, end_time, status, total_amount, discount_amount, final_amount, notes, cancellation_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: approval_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.approval_requests (id, workflow_id, requester_id, approver_id, request_type, request_data, status, approval_notes, created_at, updated_at, approved_by, approved_at, comments) FROM stdin;
\.


--
-- Data for Name: approval_workflows; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.approval_workflows (id, organization_id, workflow_type, trigger_level, approval_level, auto_approve_conditions, escalation_rules, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_log (id, actor_user_id, actor_role, action, entity_type, entity_id, meta, created_at) FROM stdin;
8412c599-1bf4-4368-9348-126caeddb00a	\N	partner_admin	feature_toggle	offer	ec68caf2-bc6a-4ba4-916d-a3a4a7ff7beb	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "ec68caf2-bc6a-4ba4-916d-a3a4a7ff7beb", "partner_id": "00993477-9d54-4288-81a2-86f684a49329", "is_promoted": false, "featured_request_pending": false}}	2025-11-12 08:43:01.055643
247f7c66-4e38-4432-9b20-33ba669bcc97	29818457-71df-4302-8634-52e11814266b	super_admin	partner_status_update	partner	59597291-826a-48f6-b3e0-6f2f19892d9e	{"next": {"is_active": true}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": false}}	2025-11-14 19:57:29.496527
2b31e2cb-668d-4264-b333-0e9a48c9c9d0	29818457-71df-4302-8634-52e11814266b	super_admin	partner_status_update	partner	e178e5af-906c-4c6b-bf39-e116d8c97cae	{"next": {"is_active": true}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": false}}	2025-11-14 20:18:41.636619
29aea281-742e-430a-8834-cb32addba812	\N	partner_admin	feature_toggle	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 20:49:00.990275
c37086e2-2f52-4333-9b93-2f6b5edb33cc	\N	partner_admin	feature_toggle	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 20:50:01.084406
042cf8b3-03f0-42b1-982e-3b1aad9f2ee2	\N	partner_admin	feature_toggle	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 20:59:28.508099
5f2938ed-6f96-40b8-96c7-9ecdea0bfe02	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:09:19.805973
2e0f2a42-b176-438c-bf30-3afc975e6888	\N	partner_admin	feature_toggle	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 21:10:03.319219
eb67ac4b-4884-4736-8610-0cdb9a572335	\N	partner_admin	feature_toggle	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 21:10:26.680451
8ac15fa2-df75-4d7b-a7f8-c91120555db5	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:14:20.272936
1eef27ca-c335-4b92-816f-5ebc639997ae	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:14:32.298355
1918a912-ae4b-484a-b243-6c11c5f6a9ed	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:14:33.245006
8ebcedff-5646-466a-992c-3ed151bc7e6a	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:14:34.061308
ae120c99-d958-4698-b8e5-e97ab21885a4	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:14:34.993675
1dd55e2f-595d-43e8-b753-854ff0505068	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:14:35.759026
99f830ac-fb36-459a-b23e-e10dea3b2399	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:14:36.661475
01ab7085-ddc1-4eec-88bc-9f2057679c5d	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:15:01.63446
e4f40897-6679-408a-8bfb-4049ed712083	29818457-71df-4302-8634-52e11814266b	super_admin	deal_status_update	offer	5315d973-dfe1-442d-8ecb-51b4580e8926	{"next": {"is_active": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": true, "featured_request_pending": false}}	2025-11-14 21:15:05.698223
bdfd2c18-09c4-453b-95eb-d93a5116fdbd	\N	partner_admin	feature_request	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"featured_request_pending": true}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 22:09:21.559318
8530696e-2e28-40e3-ada3-a1a642087fde	29818457-71df-4302-8634-52e11814266b	super_admin	feature_moderation	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": true, "forced_by_admin": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "reason": null, "previous": {"is_promoted": false, "forced_by_admin": false, "featured_request_pending": true}, "partner_eligible": false}	2025-11-14 22:09:32.323808
b0fa4bf6-333e-4f45-bebb-05d946a316e9	\N	partner_admin	feature_toggle	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": true, "featured_request_pending": false}}	2025-11-14 22:10:21.285451
eb2e35d0-8ccb-4a1e-b675-7011bddbc20a	\N	partner_admin	feature_toggle	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 22:10:37.451998
b87b58b4-e6b0-434f-b391-9c6e66dd2146	\N	partner_admin	feature_toggle	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 22:10:58.070451
94b8e75f-290f-4c2f-a5a7-c03708651e40	29818457-71df-4302-8634-52e11814266b	super_admin	feature_moderation	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": true, "forced_by_admin": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "reason": null, "previous": {"is_promoted": false, "forced_by_admin": true, "featured_request_pending": false}, "partner_eligible": false}	2025-11-14 22:11:15.234902
d274e765-b2d6-48d8-8993-3f69b2a34621	29818457-71df-4302-8634-52e11814266b	super_admin	feature_moderation	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": false, "forced_by_admin": false, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "reason": null, "previous": {"is_promoted": true, "forced_by_admin": true, "featured_request_pending": false}, "partner_eligible": false}	2025-11-14 22:11:18.098395
b367f4ae-910b-4cd4-b16f-ce4979551fa8	\N	partner_admin	feature_request	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"featured_request_pending": true}, "actor": {"id": null, "name": "System", "role": "partner_admin"}, "previous": {"id": "23130fcf-d631-40a8-8e59-881dda74b164", "partner_id": "e178e5af-906c-4c6b-bf39-e116d8c97cae", "is_promoted": false, "featured_request_pending": false}}	2025-11-14 22:11:45.102212
b5f3b2cc-eadb-418d-8e9a-45a0ac5bfd72	29818457-71df-4302-8634-52e11814266b	super_admin	feature_moderation	offer	23130fcf-d631-40a8-8e59-881dda74b164	{"next": {"is_promoted": true, "forced_by_admin": true, "featured_request_pending": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "reason": null, "previous": {"is_promoted": false, "forced_by_admin": false, "featured_request_pending": true}, "partner_eligible": false}	2025-11-14 22:11:55.912832
884bdcd5-b44d-40c6-8ddd-0b2f3aafc7b6	29818457-71df-4302-8634-52e11814266b	super_admin	partner_status_update	partner	7aca92cd-5679-4f57-b849-6b751a0b09b6	{"next": {"is_active": false}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "toggle", "previous": {"is_active": true}}	2025-11-15 11:21:16.276531
ba31a276-9ea3-430a-9ac7-c4964b2d114e	29818457-71df-4302-8634-52e11814266b	super_admin	partner_status_update	partner	7aca92cd-5679-4f57-b849-6b751a0b09b6	{"next": {"is_active": true}, "actor": {"id": "29818457-71df-4302-8634-52e11814266b", "name": "nishant verma", "role": "super_admin"}, "action": "approve", "previous": {"is_active": false}}	2025-11-15 11:33:36.194328
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, action, resource_type, resource_id, old_value, new_value, ip_address, created_at) FROM stdin;
\.


--
-- Data for Name: beverage_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.beverage_categories (id, name, slug, description, is_active, created_at, icon) FROM stdin;
589da98b-9f3f-4393-b657-77c03b97bb25	Alcoholic	alcoholic	Alcoholic beverages	t	2025-10-25 10:01:22.900705	\N
5b9fcd51-c494-4992-a1bf-73810f611d25	Non-Alcoholic	non-alcoholic	Non-alcoholic beverages	t	2025-10-25 10:01:22.900705	\N
1b5bb1a4-b034-4c2e-b4b6-2579a90bb909	Hot Beverages	hot-beverages	Tea, coffee, and hot drinks	t	2025-10-25 10:01:22.900705	\N
82f3846a-6465-4d38-aac2-ec8c2f136389	Cold Beverages	cold-beverages	Cold drinks and juices	t	2025-10-25 10:01:22.900705	\N
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bookings (id, user_id, event_id, num_tickets, partner_id, booking_date, booking_time, num_guests, table_preference, booking_type, total_price, special_requests, status, booking_reference, confirmed_at, cancelled_at, cancellation_reason, created_at, updated_at, is_pre_order, pre_order_items, deal_id, slot_id, fiat_amount, ezt_redeemed, reward_eligible, reward_credited, show_id, seat_ids, cinema_name, screen_name, movie_title) FROM stdin;
e668aff7-8662-4757-b6b1-1c58ee2069f5	814b57ad-9952-4591-8a93-2d94bbe31f21	\N	1	00993477-9d54-4288-81a2-86f684a49329	2025-12-31	\N	1	\N	event	1875.00	\N	confirmed	DB1762917498770E31F21W2C588	\N	\N	\N	2025-11-12 08:48:18.752109	2025-11-12 08:48:18.752109	f	\N	5315d973-dfe1-442d-8ecb-51b4580e8926	\N	1875.00	6.25000	t	f	\N	\N	\N	\N	\N
318bedce-b347-4005-804b-899d77dc3a1f	29818457-71df-4302-8634-52e11814266b	\N	1	99b2336d-9f6a-443d-bc4e-8ff46f9db147	2025-11-15	\N	1	\N	event	750.00	\N	confirmed	DB176313854836514266BRVTUNA	\N	\N	\N	2025-11-14 22:12:28.346709	2025-11-14 22:12:28.346709	f	\N	1d34f4f9-fcc9-4e11-a230-286d12c8a4d0	\N	750.00	2.50000	t	f	\N	\N	\N	\N	\N
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, slug, description, icon_url, is_active, launch_date, display_order, created_at, updated_at) FROM stdin;
536fc5f1-bb76-4a45-83a2-a6957cf48a89	Dining	dining	Restaurants, cafes, fine dining, and food experiences	\N	t	\N	1	2025-10-20 12:33:12.566391	2025-11-17 05:46:41.593005
67a637ef-984b-4f63-8333-efd7ca127c1b	Spa and Salon	spa-and-salon	Hair, beauty, spa treatments, and personal care services	\N	t	\N	2	2025-10-21 10:04:10.859827	2025-11-17 05:46:41.619164
bac7cbe5-c691-4614-be61-1712a69ae836	Healthcare	healthcare	Hospitals, clinics, diagnostics, and premium medical services	\N	t	\N	3	2025-11-14 20:08:10.595726	2025-11-17 05:46:41.619734
f881f713-14f6-4fb9-93a3-761e654b477d	Wellness	wellness	Fitness centers, yoga, therapy, and holistic wellness	\N	t	\N	4	2025-10-20 12:33:12.566391	2025-11-17 05:46:41.620658
e28cfb77-a2b1-400c-a1b2-9b7e511a4401	Events	events	Concerts, shows, immersive experiences, and entertainment venues	\N	t	\N	5	2025-10-20 12:33:12.566391	2025-11-17 05:46:41.622309
967434b5-5f47-41cd-a050-83e7c479f1cb	Travel	travel	Hotels, getaways, tours, transportation, and destination travel	\N	t	\N	6	2025-10-20 12:33:12.566391	2025-11-17 05:46:41.622749
4e77d8c9-41ae-41fc-963b-116e8fa48a58	Others	others	Boutiques, lifestyle services, and everything in between	\N	t	\N	7	2025-10-20 12:33:12.566391	2025-11-17 05:46:41.623141
\.


--
-- Data for Name: check_ins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.check_ins (id, user_id, partner_id, category_id, nfc_tag_id, check_in_token, latitude, longitude, check_in_method, status, transaction_id, checked_in_at, checked_out_at, created_at) FROM stdin;
\.


--
-- Data for Name: compliance_audits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.compliance_audits (id, organization_id, store_id, standard_id, auditor_id, audit_date, compliance_score, findings, recommendations, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customers (id, email, phone, first_name, last_name, date_of_birth, gender, address, city, pincode, profile_image_url, is_active, email_verified, phone_verified, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: deal_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deal_slots (id, deal_id, date, time_slot, capacity, booked, price, is_available, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: dish_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dish_categories (id, name, slug, description, is_active, created_at, icon) FROM stdin;
fcbf1133-d474-452c-9be8-aca645bbe7f8	Vegetarian	veg	Vegetarian dishes	t	2025-10-25 10:01:22.900296	\N
0a60a3dc-fc1b-41f2-b71f-633a09f83da0	Non-Vegetarian	non-veg	Non-vegetarian dishes	t	2025-10-25 10:01:22.900296	\N
d3c1969c-6563-4de1-942c-4e34f4b66e51	Vegan	vegan	Vegan dishes	t	2025-10-25 10:01:22.900296	\N
4ee09792-adc2-40fc-a231-d91588677ca8	Jain	jain	Jain vegetarian dishes	t	2025-10-25 10:01:22.900296	\N
\.


--
-- Data for Name: email_verification_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_verification_tokens (id, user_id, email, token, purpose, is_used, used_at, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: event_attributes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_attributes (id, event_id, attribute_type, attribute_value, created_at) FROM stdin;
\.


--
-- Data for Name: event_bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_bookings (id, user_id, menu_item_id, partner_id, num_tickets, total_price, booking_reference, special_requests, status, confirmed_at, cancelled_at, cancellation_reason, created_at, updated_at, payment_status, payment_method, payment_id, qr_code, checked_in_at) FROM stdin;
\.


--
-- Data for Name: event_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_categories (id, slug, name, description, icon, color, parent_category_id, display_order, is_active, created_at, updated_at) FROM stdin;
31b92a72-6ba2-49d8-b862-04e020efe022	music	Music & Concerts	Live music, concerts, and musical performances	🎵	#FF6B6B	\N	1	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
2558a842-17c2-4f28-85c2-f598a685582f	performing_arts	Performing Arts	Theater, dance, comedy, and live performances	🎭	#4ECDC4	\N	2	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
d717bf31-d20d-4f46-88a4-87051809a52c	sports	Sports & Recreation	Sports events, tournaments, and fitness activities	⚽	#45B7D1	\N	3	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
e86c11af-6820-40c3-af7e-f58a9f76086a	business	Business & Professional	Conferences, networking, and professional events	💼	#96CEB4	\N	4	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
34b48469-0b9a-42ec-8e9a-3bedc6031261	food_beverage	Food & Beverage	Culinary events, tastings, and food festivals	🍽️	#FFEAA7	\N	5	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
081b2960-b09f-43f9-bf2c-49ab7fc8cefc	arts_culture	Arts & Culture	Art exhibitions, cultural events, and creative activities	🎨	#DDA0DD	\N	6	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
358adfdd-bf54-4aa9-b252-a62e2dc1d330	community	Community & Social	Meetups, social events, and community gatherings	🤝	#98D8C8	\N	7	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
4351b446-7e27-4bc4-85df-99d09ed391ea	education	Education & Learning	Classes, workshops, and educational events	📚	#F7DC6F	\N	8	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
61744bf0-ad88-48d9-976a-74bfa455b06e	wellness	Health & Wellness	Fitness, wellness, and health-related events	💪	#BB8FCE	\N	9	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
50592c53-74fd-4400-8592-a2dba7065aa2	family	Family & Kids	Family-friendly events and children's activities	👨‍👩‍👧‍👦	#85C1E9	\N	10	t	2025-10-25 10:17:04.681885	2025-10-25 10:17:04.681885
\.


--
-- Data for Name: event_subcategories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_subcategories (id, category_id, slug, name, description, display_order, is_active, created_at, updated_at) FROM stdin;
27c366bd-9867-4b7e-a741-5842e65f60e6	31b92a72-6ba2-49d8-b862-04e020efe022	rock_concert	Rock Concert	Rock and alternative music concerts	1	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
963c82f3-3376-4365-b875-9c9778428c6f	31b92a72-6ba2-49d8-b862-04e020efe022	pop_concert	Pop Concert	Pop music concerts and performances	2	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
30fd2809-3766-46ac-8221-43c7560c0e50	31b92a72-6ba2-49d8-b862-04e020efe022	classical_music	Classical Music	Classical music concerts and performances	3	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
68cba335-b7b5-41e7-9813-a40817d1b5d0	31b92a72-6ba2-49d8-b862-04e020efe022	jazz_blues	Jazz & Blues	Jazz and blues music events	4	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
5071b482-9bef-424c-a78d-7ded85a2dc77	31b92a72-6ba2-49d8-b862-04e020efe022	electronic_dj	Electronic/DJ	Electronic music and DJ performances	5	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
f18eb9dc-1530-4502-a65b-6e4f9454a066	31b92a72-6ba2-49d8-b862-04e020efe022	hip_hop	Hip Hop	Hip hop and rap music events	6	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
b7d80e94-a6a2-4c70-97c1-5b8cc0f9e6b2	31b92a72-6ba2-49d8-b862-04e020efe022	country	Country	Country music concerts and events	7	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
f46453af-6d1d-40a6-8f93-bb66fa29135e	31b92a72-6ba2-49d8-b862-04e020efe022	folk_acoustic	Folk & Acoustic	Folk and acoustic music performances	8	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
40524b39-ce00-4a2e-84fa-f02ca84082e1	31b92a72-6ba2-49d8-b862-04e020efe022	music_festival	Music Festival	Multi-day music festivals	9	t	2025-10-25 10:17:04.686146	2025-10-25 10:17:04.686146
b186ec66-04ad-497e-973e-a219cafb72e7	2558a842-17c2-4f28-85c2-f598a685582f	theater	Theater	Theater productions and plays	1	t	2025-10-25 10:17:04.700179	2025-10-25 10:17:04.700179
c46f9f93-d87d-4e06-97ee-545dbeb1372b	2558a842-17c2-4f28-85c2-f598a685582f	musical_theater	Musical Theater	Musical theater and Broadway shows	2	t	2025-10-25 10:17:04.700179	2025-10-25 10:17:04.700179
9ae8c2cf-6439-4174-90ee-380eb5c87e5f	2558a842-17c2-4f28-85c2-f598a685582f	opera	Opera	Opera performances	3	t	2025-10-25 10:17:04.700179	2025-10-25 10:17:04.700179
f513f815-fa36-4a1f-a25f-30bb16322d3d	2558a842-17c2-4f28-85c2-f598a685582f	ballet	Ballet	Ballet performances and dance shows	4	t	2025-10-25 10:17:04.700179	2025-10-25 10:17:04.700179
fc7c07fe-39e4-418c-a3c4-0778f1a2ed55	2558a842-17c2-4f28-85c2-f598a685582f	contemporary_dance	Contemporary Dance	Modern and contemporary dance performances	5	t	2025-10-25 10:17:04.700179	2025-10-25 10:17:04.700179
d7f12de8-d154-45a8-9750-9eee86948f04	2558a842-17c2-4f28-85c2-f598a685582f	standup_comedy	Stand-up Comedy	Stand-up comedy shows	6	t	2025-10-25 10:17:04.700179	2025-10-25 10:17:04.700179
09c132f2-56c9-4fcf-97b2-2d837854e72e	2558a842-17c2-4f28-85c2-f598a685582f	magic_show	Magic Show	Magic shows and illusion performances	7	t	2025-10-25 10:17:04.700179	2025-10-25 10:17:04.700179
259f9177-f67f-4679-8929-9c499ae605a7	2558a842-17c2-4f28-85c2-f598a685582f	circus	Circus	Circus shows and acrobatic performances	8	t	2025-10-25 10:17:04.700179	2025-10-25 10:17:04.700179
251200b0-376c-4b88-ab4b-122085a1c018	d717bf31-d20d-4f46-88a4-87051809a52c	cricket_match	Cricket Match	Cricket matches and tournaments	1	t	2025-10-25 10:17:04.701085	2025-10-25 10:17:04.701085
9aadeb21-64ab-40ac-9727-7b77e07d5d82	d717bf31-d20d-4f46-88a4-87051809a52c	football_soccer	Football/Soccer	Football and soccer matches	2	t	2025-10-25 10:17:04.701085	2025-10-25 10:17:04.701085
2f9a8377-b3b3-45ca-bed5-82a6daef779e	d717bf31-d20d-4f46-88a4-87051809a52c	basketball	Basketball	Basketball games and tournaments	3	t	2025-10-25 10:17:04.701085	2025-10-25 10:17:04.701085
629401eb-1ad2-42d1-811d-7182da942507	d717bf31-d20d-4f46-88a4-87051809a52c	tennis	Tennis	Tennis matches and tournaments	4	t	2025-10-25 10:17:04.701085	2025-10-25 10:17:04.701085
989016ca-fa21-4a09-b68a-0e2cae8898c5	d717bf31-d20d-4f46-88a4-87051809a52c	marathon_race	Marathon/Race	Running events and marathons	5	t	2025-10-25 10:17:04.701085	2025-10-25 10:17:04.701085
3bbe5e50-b89b-425f-8a83-f8a5d6193608	d717bf31-d20d-4f46-88a4-87051809a52c	esports	Esports	Electronic sports and gaming tournaments	6	t	2025-10-25 10:17:04.701085	2025-10-25 10:17:04.701085
904bfd95-d3ef-4b5d-af17-d6d3fd47cb23	d717bf31-d20d-4f46-88a4-87051809a52c	combat_sports	Combat Sports	Boxing, MMA, and martial arts events	7	t	2025-10-25 10:17:04.701085	2025-10-25 10:17:04.701085
c3b4860e-b0a8-4337-ad09-f6271b43e4d0	d717bf31-d20d-4f46-88a4-87051809a52c	extreme_sports	Extreme Sports	Extreme sports and adventure activities	8	t	2025-10-25 10:17:04.701085	2025-10-25 10:17:04.701085
7ae7537e-1e2f-4196-885c-0331e65f1738	e86c11af-6820-40c3-af7e-f58a9f76086a	conference	Conference	Business and professional conferences	1	t	2025-10-25 10:17:04.701482	2025-10-25 10:17:04.701482
294e6fcf-538b-4019-8939-75b92f50e270	e86c11af-6820-40c3-af7e-f58a9f76086a	trade_show	Trade Show	Trade shows and exhibitions	2	t	2025-10-25 10:17:04.701482	2025-10-25 10:17:04.701482
7dfb92a9-d5e1-4320-80c6-031489289c4b	e86c11af-6820-40c3-af7e-f58a9f76086a	networking_event	Networking Event	Professional networking events	3	t	2025-10-25 10:17:04.701482	2025-10-25 10:17:04.701482
85fbfca2-4115-454c-b654-a1592d44abc2	e86c11af-6820-40c3-af7e-f58a9f76086a	workshop	Workshop	Professional workshops and training	4	t	2025-10-25 10:17:04.701482	2025-10-25 10:17:04.701482
f78b9996-c60b-4f4c-9d4f-0079548265d4	e86c11af-6820-40c3-af7e-f58a9f76086a	seminar	Seminar	Educational seminars and talks	5	t	2025-10-25 10:17:04.701482	2025-10-25 10:17:04.701482
68dd259b-414a-4f63-a9f0-78f9b531f478	e86c11af-6820-40c3-af7e-f58a9f76086a	product_launch	Product Launch	Product launches and announcements	6	t	2025-10-25 10:17:04.701482	2025-10-25 10:17:04.701482
73a20354-301b-4a0d-afbd-a8da9f52fc21	e86c11af-6820-40c3-af7e-f58a9f76086a	career_fair	Career Fair	Job fairs and career events	7	t	2025-10-25 10:17:04.701482	2025-10-25 10:17:04.701482
bde342b1-dbdf-4072-b8ab-3d175971c446	e86c11af-6820-40c3-af7e-f58a9f76086a	pitch_competition	Pitch Competition	Startup pitch competitions	8	t	2025-10-25 10:17:04.701482	2025-10-25 10:17:04.701482
ba6307ff-b34d-4f31-b5d3-6e9b43c40709	34b48469-0b9a-42ec-8e9a-3bedc6031261	food_festival	Food Festival	Food festivals and culinary events	1	t	2025-10-25 10:17:04.701906	2025-10-25 10:17:04.701906
b02464cd-f144-4b5d-b7d7-ef969ba0a3c5	34b48469-0b9a-42ec-8e9a-3bedc6031261	wine_tasting	Wine Tasting	Wine tastings and wine events	2	t	2025-10-25 10:17:04.701906	2025-10-25 10:17:04.701906
c03d94dc-4210-4988-81da-c106f269cc7e	34b48469-0b9a-42ec-8e9a-3bedc6031261	beer_festival	Beer Festival	Beer festivals and craft beer events	3	t	2025-10-25 10:17:04.701906	2025-10-25 10:17:04.701906
99089fee-dd65-4289-b8f1-d45ec3756e4b	34b48469-0b9a-42ec-8e9a-3bedc6031261	cooking_class	Cooking Class	Cooking classes and culinary workshops	4	t	2025-10-25 10:17:04.701906	2025-10-25 10:17:04.701906
62a0bf7f-0239-4ffe-b538-0840c9698f48	34b48469-0b9a-42ec-8e9a-3bedc6031261	restaurant_popup	Restaurant Pop-up	Pop-up restaurants and temporary dining	5	t	2025-10-25 10:17:04.701906	2025-10-25 10:17:04.701906
2c63a869-88b4-4c2c-8e5c-582cdcd31798	34b48469-0b9a-42ec-8e9a-3bedc6031261	food_truck_rally	Food Truck Rally	Food truck gatherings and events	6	t	2025-10-25 10:17:04.701906	2025-10-25 10:17:04.701906
01f380b2-7ea3-4552-b4cd-ff3abd670667	34b48469-0b9a-42ec-8e9a-3bedc6031261	culinary_competition	Culinary Competition	Cooking competitions and chef battles	7	t	2025-10-25 10:17:04.701906	2025-10-25 10:17:04.701906
0e5a152d-4c35-46b9-b936-2cb74d679398	081b2960-b09f-43f9-bf2c-49ab7fc8cefc	art_exhibition	Art Exhibition	Art gallery exhibitions and openings	1	t	2025-10-25 10:17:04.702326	2025-10-25 10:17:04.702326
eb9d5ef9-7b3b-4af3-9540-3c6ff2552d27	081b2960-b09f-43f9-bf2c-49ab7fc8cefc	film_screening	Film Screening	Movie screenings and film events	2	t	2025-10-25 10:17:04.702326	2025-10-25 10:17:04.702326
14ee6590-4d3f-4014-a5a8-701ffb050c4d	081b2960-b09f-43f9-bf2c-49ab7fc8cefc	film_festival	Film Festival	Film festivals and cinema events	3	t	2025-10-25 10:17:04.702326	2025-10-25 10:17:04.702326
bb449d5e-830f-4cb9-b0db-d3a48905ed52	081b2960-b09f-43f9-bf2c-49ab7fc8cefc	book_reading	Book Reading	Book readings and literary events	4	t	2025-10-25 10:17:04.702326	2025-10-25 10:17:04.702326
0fedb16b-f0d0-4314-9979-a148f95e9c84	081b2960-b09f-43f9-bf2c-49ab7fc8cefc	literary_festival	Literary Festival	Literary festivals and writing events	5	t	2025-10-25 10:17:04.702326	2025-10-25 10:17:04.702326
959ee535-142e-4753-9818-d7b3f8ecaf47	081b2960-b09f-43f9-bf2c-49ab7fc8cefc	cultural_festival	Cultural Festival	Cultural festivals and heritage events	6	t	2025-10-25 10:17:04.702326	2025-10-25 10:17:04.702326
8af2d471-d895-462b-8848-6dc165e3cdc3	081b2960-b09f-43f9-bf2c-49ab7fc8cefc	museum_event	Museum Event	Museum exhibitions and cultural events	7	t	2025-10-25 10:17:04.702326	2025-10-25 10:17:04.702326
dd5dc227-e7ff-4bc0-b4e5-2d0d47f07ceb	081b2960-b09f-43f9-bf2c-49ab7fc8cefc	gallery_opening	Gallery Opening	Art gallery openings and exhibitions	8	t	2025-10-25 10:17:04.702326	2025-10-25 10:17:04.702326
aeb8289f-d820-4736-9c58-6090800e7148	358adfdd-bf54-4aa9-b252-a62e2dc1d330	meetup	Meetup	Interest-based meetups and gatherings	1	t	2025-10-25 10:17:04.70273	2025-10-25 10:17:04.70273
c40aa463-0c2b-4bb2-b8f5-d526c1c873bf	358adfdd-bf54-4aa9-b252-a62e2dc1d330	social_mixer	Social Mixer	Social networking and mixer events	2	t	2025-10-25 10:17:04.70273	2025-10-25 10:17:04.70273
5225c24d-ef9d-4801-81e9-495e3673b2ad	358adfdd-bf54-4aa9-b252-a62e2dc1d330	charity_event	Charity Event	Charity fundraisers and volunteer events	3	t	2025-10-25 10:17:04.70273	2025-10-25 10:17:04.70273
7febd464-77b5-403f-bf11-84df527da5ee	358adfdd-bf54-4aa9-b252-a62e2dc1d330	fundraiser	Fundraiser	Fundraising events and campaigns	4	t	2025-10-25 10:17:04.70273	2025-10-25 10:17:04.70273
d8edd578-e1aa-4951-8a93-18ab95977fa6	358adfdd-bf54-4aa9-b252-a62e2dc1d330	volunteer_activity	Volunteer Activity	Volunteer opportunities and community service	5	t	2025-10-25 10:17:04.70273	2025-10-25 10:17:04.70273
ecebddbd-371a-4bd3-a0c0-94d0a564d9d5	358adfdd-bf54-4aa9-b252-a62e2dc1d330	religious_event	Religious Event	Religious ceremonies and spiritual events	6	t	2025-10-25 10:17:04.70273	2025-10-25 10:17:04.70273
1c3814fe-a3b8-4a22-a657-5548c2b109d2	358adfdd-bf54-4aa9-b252-a62e2dc1d330	holiday_celebration	Holiday Celebration	Holiday celebrations and seasonal events	7	t	2025-10-25 10:17:04.70273	2025-10-25 10:17:04.70273
a0e0b729-3527-4916-9572-b621e98a0ef9	358adfdd-bf54-4aa9-b252-a62e2dc1d330	block_party	Block Party	Community block parties and neighborhood events	8	t	2025-10-25 10:17:04.70273	2025-10-25 10:17:04.70273
fa57d978-131b-4180-a978-cde0b8f80b19	4351b446-7e27-4bc4-85df-99d09ed391ea	class_course	Class/Course	Educational classes and courses	1	t	2025-10-25 10:17:04.703529	2025-10-25 10:17:04.703529
6710c9c3-f396-43f5-b4ae-6016457ad47a	4351b446-7e27-4bc4-85df-99d09ed391ea	lecture	Lecture	Educational lectures and talks	2	t	2025-10-25 10:17:04.703529	2025-10-25 10:17:04.703529
814cb1d4-12b1-444f-8299-0301f07a36a5	4351b446-7e27-4bc4-85df-99d09ed391ea	tutorial	Tutorial	Tutorial sessions and workshops	3	t	2025-10-25 10:17:04.703529	2025-10-25 10:17:04.703529
30432395-958d-4895-8840-defe3c10b70c	4351b446-7e27-4bc4-85df-99d09ed391ea	study_group	Study Group	Study groups and learning sessions	4	t	2025-10-25 10:17:04.703529	2025-10-25 10:17:04.703529
6d203863-9903-4771-b2ee-2cc6cf1aea11	4351b446-7e27-4bc4-85df-99d09ed391ea	hackathon	Hackathon	Programming and tech hackathons	5	t	2025-10-25 10:17:04.703529	2025-10-25 10:17:04.703529
78ac77bc-3404-4754-a4fc-c81234cc2289	4351b446-7e27-4bc4-85df-99d09ed391ea	science_fair	Science Fair	Science fairs and STEM events	6	t	2025-10-25 10:17:04.703529	2025-10-25 10:17:04.703529
ac5763a9-7f92-4080-81a8-52b975bb1fe3	4351b446-7e27-4bc4-85df-99d09ed391ea	academic_conference	Academic Conference	Academic conferences and research events	7	t	2025-10-25 10:17:04.703529	2025-10-25 10:17:04.703529
3b3ca871-4261-43aa-adc7-bee5498124f6	61744bf0-ad88-48d9-976a-74bfa455b06e	yoga_class	Yoga Class	Yoga classes and workshops	1	t	2025-10-25 10:17:04.704446	2025-10-25 10:17:04.704446
b2c3a708-56ba-42f2-87ed-62a6f5957867	61744bf0-ad88-48d9-976a-74bfa455b06e	meditation_session	Meditation Session	Meditation and mindfulness sessions	2	t	2025-10-25 10:17:04.704446	2025-10-25 10:17:04.704446
150e5198-f10e-4aba-8867-4efc5ba91e2d	61744bf0-ad88-48d9-976a-74bfa455b06e	fitness_class	Fitness Class	Fitness classes and workout sessions	3	t	2025-10-25 10:17:04.704446	2025-10-25 10:17:04.704446
0f9f5558-b7ea-4b90-a5f5-52aeca2a68fb	61744bf0-ad88-48d9-976a-74bfa455b06e	health_seminar	Health Seminar	Health and wellness seminars	4	t	2025-10-25 10:17:04.704446	2025-10-25 10:17:04.704446
1ea5d105-409d-433e-8b4a-505cccf0fd8d	61744bf0-ad88-48d9-976a-74bfa455b06e	wellness_retreat	Wellness Retreat	Wellness retreats and spa events	5	t	2025-10-25 10:17:04.704446	2025-10-25 10:17:04.704446
6e5d32fe-068f-42c6-ad19-a58a05c4bc54	61744bf0-ad88-48d9-976a-74bfa455b06e	mental_health_workshop	Mental Health Workshop	Mental health and wellness workshops	6	t	2025-10-25 10:17:04.704446	2025-10-25 10:17:04.704446
a4bfb94d-de26-456a-91ff-bfbcd1a5627d	50592c53-74fd-4400-8592-a2dba7065aa2	kids_workshop	Kids Workshop	Children's workshops and activities	1	t	2025-10-25 10:17:04.704794	2025-10-25 10:17:04.704794
76eb50f8-2ef4-4701-947d-9f52e5b8c884	50592c53-74fd-4400-8592-a2dba7065aa2	family_festival	Family Festival	Family-friendly festivals and events	2	t	2025-10-25 10:17:04.704794	2025-10-25 10:17:04.704794
3f9b14da-d7f3-4024-b099-7483dcd16561	50592c53-74fd-4400-8592-a2dba7065aa2	childrens_theater	Children's Theater	Children's theater and entertainment	3	t	2025-10-25 10:17:04.704794	2025-10-25 10:17:04.704794
34908d6f-c7f9-4ca6-be73-c21ae714ee0a	50592c53-74fd-4400-8592-a2dba7065aa2	educational_program	Educational Program	Educational programs for children	4	t	2025-10-25 10:17:04.704794	2025-10-25 10:17:04.704794
2aa06764-08a6-45ad-aa9f-f5b6042246b7	50592c53-74fd-4400-8592-a2dba7065aa2	birthday_party	Birthday Party	Birthday party events and celebrations	5	t	2025-10-25 10:17:04.704794	2025-10-25 10:17:04.704794
dd739777-851c-46b2-8d98-fd42c8ab738f	50592c53-74fd-4400-8592-a2dba7065aa2	story_time	Story Time	Story time and reading events	6	t	2025-10-25 10:17:04.704794	2025-10-25 10:17:04.704794
\.


--
-- Data for Name: event_tag_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_tag_mappings (id, event_id, tag_id, created_at) FROM stdin;
\.


--
-- Data for Name: event_tags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_tags (id, slug, name, tag_type, description, is_active, created_at) FROM stdin;
863e3adf-16c3-4973-9996-0448c924a6dc	interactive	Interactive	experience	Hands-on and interactive experience	t	2025-10-25 10:17:04.705298
3afbe3fa-54c6-4910-ad63-f79ad4fb3c39	educational	Educational	experience	Learning and educational content	t	2025-10-25 10:17:04.705298
0ae5af8d-678e-44a9-9ae9-cd5be2fff97d	entertaining	Entertaining	experience	Fun and entertaining experience	t	2025-10-25 10:17:04.705298
912dedb9-0abc-46d3-a87d-37bb07ab40a8	networking	Networking	experience	Professional networking opportunity	t	2025-10-25 10:17:04.705298
6f6df7c3-93e7-4dbc-a465-15514396e709	hands_on	Hands-on	experience	Practical, hands-on learning	t	2025-10-25 10:17:04.705298
6bff51cc-d087-4cd9-9cb7-ecaa41465a12	celebrity_appearance	Celebrity Appearance	feature	Celebrity guest or performer	t	2025-10-25 10:17:04.705298
965c3a07-1df9-4a40-9511-183202ecc73b	live_music	Live Music	feature	Live musical performance	t	2025-10-25 10:17:04.705298
796519cc-5ca3-4554-8aad-3d974697bedc	food_included	Food Included	feature	Food and meals provided	t	2025-10-25 10:17:04.705298
c994980e-664a-46b3-9eb0-d7b5a3a46472	drinks_included	Drinks Included	feature	Beverages and drinks provided	t	2025-10-25 10:17:04.705298
819db2cf-c87c-4a18-a478-fa9b56f11652	merchandise_available	Merchandise Available	feature	Event merchandise for purchase	t	2025-10-25 10:17:04.705298
5120cc89-0da9-4b82-bbc0-a4210136fbf9	photo_opportunity	Photo Opportunity	feature	Photo opportunities with performers/guests	t	2025-10-25 10:17:04.705298
3aa4a173-db29-42d2-80ac-a33adbbc8b3d	meet_greet	Meet & Greet	feature	Meet and greet with performers/guests	t	2025-10-25 10:17:04.705298
db1dee1b-f259-40ea-a524-9ad47018afdc	seasonal	Seasonal	theme	Seasonal or holiday themed	t	2025-10-25 10:17:04.705298
f8305a11-44b0-4d3a-8821-b21343f55073	holiday_themed	Holiday Themed	theme	Holiday celebration theme	t	2025-10-25 10:17:04.705298
0d2ad2ca-8258-41cf-8a29-80da68e54cd3	retro	Retro	theme	Retro or vintage theme	t	2025-10-25 10:17:04.705298
f2c86196-da55-47a4-aa19-dd1b3fa51882	modern	Modern	theme	Contemporary and modern theme	t	2025-10-25 10:17:04.705298
876373cb-0dc8-4488-907e-bb0ed989fa42	traditional	Traditional	theme	Traditional cultural theme	t	2025-10-25 10:17:04.705298
e69cf4ff-3112-46bf-b969-581d7160e574	experimental	Experimental	theme	Experimental or avant-garde theme	t	2025-10-25 10:17:04.705298
fbcbd1ac-ef9a-47f9-8b96-e6b71dd3cd75	certificate_provided	Certificate Provided	benefit	Certificate or completion document	t	2025-10-25 10:17:04.705298
c160b891-1063-48db-9abc-7923b53c780a	cpd_credits	CPD Credits	benefit	Continuing Professional Development credits	t	2025-10-25 10:17:04.705298
7242ce75-5216-4f4e-98fd-59f64c1a2501	networking_opportunity	Networking Opportunity	benefit	Professional networking benefits	t	2025-10-25 10:17:04.705298
8b315205-3805-42e0-b6e9-33b9e301baec	career_advancement	Career Advancement	benefit	Career development opportunity	t	2025-10-25 10:17:04.705298
a04cf833-43e0-4770-b4ae-cfed282feaf9	skill_building	Skill Building	benefit	Skill development and learning	t	2025-10-25 10:17:04.705298
e11a0646-3743-4d5e-af0c-1d241cb5572d	date_night	Date Night	occasion	Perfect for romantic dates	t	2025-10-25 10:17:04.705298
961e4c14-b740-4afc-828b-e51c95e8863f	team_building	Team Building	occasion	Corporate team building event	t	2025-10-25 10:17:04.705298
3c13d8ab-1b33-4b20-97d0-e81954c4bbe7	corporate_outing	Corporate Outing	occasion	Corporate group event	t	2025-10-25 10:17:04.705298
036dc149-819f-4bb9-ab27-c07ef47825ac	birthday_celebration	Birthday Celebration	occasion	Birthday party or celebration	t	2025-10-25 10:17:04.705298
a31fab2f-d683-4358-889e-116356d08fd2	anniversary	Anniversary	occasion	Anniversary celebration	t	2025-10-25 10:17:04.705298
5d737820-30c2-4e29-a234-b6a0e9af41c6	limited_capacity	Limited Capacity	usp	Limited number of attendees	t	2025-10-25 10:17:04.705298
75a45bef-5506-4d18-a101-d1ccd7ecdbaf	exclusive	Exclusive	usp	Exclusive or invitation-only event	t	2025-10-25 10:17:04.705298
e1d8869c-b9ae-4624-89f3-9fe91468e444	first_time_city	First Time in City	usp	First time this event is held in the city	t	2025-10-25 10:17:04.705298
d5f2e8ea-47cd-4fa0-8177-ef1270c9c449	last_chance	Last Chance	usp	Final opportunity to attend	t	2025-10-25 10:17:04.705298
4ec8d3c8-b4d7-43d5-bdc1-cc781a596a96	early_bird_pricing	Early Bird Pricing	usp	Discounted early bird tickets available	t	2025-10-25 10:17:04.705298
7193cf89-99e2-4001-b604-01cb12e1521f	group_discounts	Group Discounts	usp	Special pricing for groups	t	2025-10-25 10:17:04.705298
\.


--
-- Data for Name: event_tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.event_tickets (id, event_id, user_id, ticket_code, qr_code, attendee_name, attendee_email, attendee_phone, price_paid, payment_method, payment_status, status, checked_in_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.events (id, title, description, start_time, end_time, venue_id, status, created_at, is_complimentary, booking_cap, seats_booked, price_per_ticket, updated_at, image_url) FROM stdin;
\.


--
-- Data for Name: food_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.food_categories (id, name, slug, description, icon, display_order, is_active, created_at, updated_at) FROM stdin;
23854f00-23f3-4bb9-8b31-773fdd2de3ea	Starters	starters	Appetizers and starters	🥗	1	t	2025-10-26 10:23:30.707461	2025-10-26 10:23:30.707461
8cdc8086-f14a-4516-ae64-af33ec459455	Main Course	main-course	Main dishes	🍽️	2	t	2025-10-26 10:23:30.707461	2025-10-26 10:23:30.707461
362457eb-d511-4388-8a31-d849bf1e46c7	Breads	breads	Breads and rotis	🍞	3	t	2025-10-26 10:23:30.707461	2025-10-26 10:23:30.707461
80df6120-0d10-4607-95d8-860442c77fbc	Rice & Biryani	rice-biryani	Rice dishes and biryanis	🍚	4	t	2025-10-26 10:23:30.707461	2025-10-26 10:23:30.707461
b254baf8-c47b-4d20-af8d-f0ad19788e07	Sides	sides	Side dishes and accompaniments	🥙	5	t	2025-10-26 10:23:30.707461	2025-10-26 10:23:30.707461
5479e0ff-1cee-45ba-970d-6c51dfe4b219	Desserts	desserts	Sweet treats	🍰	6	t	2025-10-26 10:23:30.707461	2025-10-26 10:23:30.707461
12905167-bd6b-4c03-89d4-723fbb1cbf8c	Ice Cream & Beverages	ice-cream-beverages	Cold drinks and ice creams	🥤	7	t	2025-10-26 10:23:30.707461	2025-10-26 10:23:30.707461
\.


--
-- Data for Name: food_menu_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.food_menu_categories (id, name, slug, description, display_order, is_active, created_at, updated_at) FROM stdin;
a49b687e-af76-4e48-ac62-fa942eb0bb2b	Starters	starters	Appetizers, soups, and small plates	1	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
b7aabef5-5c4d-48ad-91bb-c2068b11d7c5	Main Course	main-course	Primary dishes and entrees	2	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
d3c1af22-4951-4b8c-a181-a6f46fe07026	Breads	breads	Naan, roti, and other bread varieties	3	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
0ccc97be-dd0b-4b11-8525-0cc8061cc5b4	Sides	sides	Accompaniments and side dishes	4	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
49a12732-dd05-416a-9e9b-f8312565deb2	Rice and Biryani	rice-biryani	Rice dishes and biryani varieties	5	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
7816d831-858e-457f-94c7-259419f4af89	Beverages	beverages	Non-alcoholic drinks	6	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
9d5890a4-4736-42fc-a1b3-8f453ca016f2	Cocktails	cocktails	Alcoholic mixed drinks	7	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
6373c540-8c92-4d87-a2ad-e13587e392b9	Mocktails	mocktails	Non-alcoholic mixed drinks	8	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
dd1adb47-40a9-49cd-8786-b23634171af5	Desserts	desserts	Sweet dishes and desserts	9	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
6851d95a-2ad1-492a-915b-cddbcde59f79	Specials	specials	Chef specials and seasonal items	10	t	2025-10-25 10:01:22.893747	2025-10-25 10:01:22.893747
\.


--
-- Data for Name: health_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.health_records (id, customer_id, professional_id, record_type, title, description, diagnosis, treatment_plan, prescription, attachments, record_date, created_at) FROM stdin;
\.


--
-- Data for Name: localization_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.localization_settings (id, organization_id, store_id, language, currency, timezone, date_format, cultural_preferences, local_customizations, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.menu_items (id, partner_id, name, description, price, category, is_available, image_url, created_at, updated_at, service_category_id, duration_minutes, max_capacity, requires_booking, service_type, event_date, event_time, organizer_name, venue_name, food_category_id, dish_category_id, beverage_category_id, preparation_time, spice_level, is_chef_special, allergens, nutritional_info, is_on_offer, offer_price, offer_discount_percentage, offer_description, offer_start_date, offer_end_date, minimum_order_amount, is_trending, movie_screen_id) FROM stdin;
79112f08-3a53-4d14-9cf0-92079d0b5a1b	00993477-9d54-4288-81a2-86f684a49329	Dahi kebab	Sumptous jekabas made with Indian yogurt laced with the sweetness of dates and figs.	400.00	starters-veg	t	/uploads/menu/Picture3.png	2025-11-12 08:37:13.950567	2025-11-12 08:37:13.950567	\N	\N	\N	f	dining	\N	\N	\N	Hermanos	\N	\N	\N	15	1	f	\N	\N	f	\N	\N	\N	\N	\N	\N	f	\N
\.


--
-- Data for Name: offer_schedule_days; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offer_schedule_days (id, offer_schedule_id, day_of_week, start_time, end_time, is_active) FROM stdin;
\.


--
-- Data for Name: offer_schedule_menu_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offer_schedule_menu_items (id, offer_schedule_id, menu_item_id, discount_override, is_required) FROM stdin;
\.


--
-- Data for Name: offer_schedules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offer_schedules (id, partner_id, name, description, offer_type, discount_value, minimum_order_amount, max_uses_per_customer, total_max_uses, is_active, start_date, end_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: offer_usage; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offer_usage (id, offer_schedule_id, user_id, transaction_id, discount_applied, used_at) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, partner_id, customer_name, customer_email, customer_phone, order_items, total_amount, status, notes, created_at, updated_at) FROM stdin;
6e0f369a-b27e-4ea8-8c50-31bfbc4b9f48	00993477-9d54-4288-81a2-86f684a49329	Guest	\N	\N	[{"name": "New Year Event-Welcome 26", "price": 1875, "quantity": 1, "ezt_redeemed": 6.25, "original_price": 2500, "discount_amount": 625}]	1875.00	confirmed	\N	2025-11-12 08:48:18.868247	2025-11-12 08:48:18.868247
d43331b2-677e-4ae2-bb97-042c958a9b0e	99b2336d-9f6a-443d-bc4e-8ff46f9db147	Guest	\N	\N	[{"name": "breakfast unlimited", "price": 750, "quantity": 1, "ezt_redeemed": 2.5, "original_price": 1000, "discount_amount": 250}]	750.00	confirmed	\N	2025-11-14 22:12:28.477972	2025-11-14 22:12:28.477972
\.


--
-- Data for Name: otp_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.otp_sessions (id, phone_number, country_code, otp_hash, purpose, verified_at, expires_at, created_at, verified, attempts, used_for_registration) FROM stdin;
fecc5b3b-b0b4-4b1c-95c4-60210d690a66	9910241176	+91	$2b$05$z61sVEhiEX68dXa7Aoz23e6u8M7ID5ghRxcf/laNKKk87x8DVWd8.	login	2025-11-11 21:18:52.424329	2025-11-11 21:23:39.666	2025-11-11 21:18:39.711436	t	0	f
614d097f-9af0-420a-82c8-bbd6d15fa461	9910241176	+91	$2b$05$u01aWorpFs4UGQE9QFhyrOxcZLzdahdfKW9M/5Q26NJHJ4rz8pe8u	login	2025-11-11 21:19:42.043841	2025-11-11 21:24:29.549	2025-11-11 21:19:29.729504	t	0	f
d9c0fdee-8316-45db-8633-612c00a02f48	1234567890	+91	$2b$05$c2z58oSXzVISP29TadVyVuG2clltme09mpLgTq3DSB24SlaQvJ4yC	login	2025-11-12 08:31:02.440263	2025-11-12 08:35:46.65	2025-11-12 08:30:46.673046	t	0	f
13eacde7-5acf-4a21-9ae6-eea4d73ac5a5	1234567890	+91	$2b$05$OWfkdW4VDaIlcqKbeBBEa.Eh2H9laPhL7MiJnXv6BGSygcXDDFaDe	login	2025-11-12 08:32:07.857869	2025-11-12 08:36:57.76	2025-11-12 08:31:58.044023	t	0	f
b5bf0f79-1537-46d3-8631-a487c232ba78	1234567890	+91	$2b$05$QUn6l/GKVErkFCKGKMge8O7n7GLVDd0KXBnpCOIcBMWisjyOnRcM6	login	2025-11-12 08:37:41.028951	2025-11-12 08:42:29.699	2025-11-12 08:37:29.720995	t	0	f
76816453-6f56-4e29-a242-9f331528a5d3	1234567890	+91	$2b$05$LMfu/qgqTnQmZD02jW2KE.lR/K5czQlXEAAOoojPa3UzpmohcJiwe	login	2025-11-12 08:43:29.626707	2025-11-12 08:48:16.039	2025-11-12 08:43:16.053901	t	0	f
8e22ae2d-0663-4fa5-adc6-c1572bd91da7	1234567890	+91	$2b$05$Dc8gRa14sDATvG2yt1cwZ.gcqaANN1Boj/woYjVKyfZewR/wFdzLe	login	2025-11-12 08:47:41.59299	2025-11-12 08:52:29.88	2025-11-12 08:47:29.93085	t	0	f
2d1da90f-f660-435d-8a57-be98e50c3837	1234567890	+91	$2b$05$tRbAzJjkSbcPEIkH0NQxIOC9mpBUSUkA7RCq0wLxKD7zsXkchQXai	login	2025-11-12 09:15:49.988556	2025-11-12 09:20:38.686	2025-11-12 09:15:38.758376	t	0	f
b034203e-a17a-428f-be2f-0f5ecb708255	9811890941	+91	$2b$05$RDwD.xBjkbXbYPVDuoIa/.JL9qXFr5ObLzS1qVwuVD.Z6bhpfY6OC	login	2025-11-14 20:30:36.935967	2025-11-14 20:35:21.904	2025-11-14 20:30:21.935205	t	0	f
0dd7d245-80d7-4bb3-9c99-cccbcec00a87	9811890941	+91	$2b$05$o3XBlercWJLJm2cbsifOXuQjuDQ3HIhIhPgYnCw2yTMTIDJ1tARsy	login	2025-11-14 20:31:06.142671	2025-11-14 20:35:55.38	2025-11-14 20:30:55.391709	t	0	f
3bace8ac-3fac-4a41-afb8-b2cca669df5a	9811890941	+91	$2b$05$uxRqzlFPtu7PAahiJzA.SeVo.luYXa7lahCQRJqvVTHqgIEjltKnC	login	2025-11-14 20:49:29.714255	2025-11-14 20:54:15.833	2025-11-14 20:49:15.853727	t	0	f
f2e2a92d-1674-480e-ba68-5eb651bbb7c1	9811890941	+91	$2b$05$GSVEpJR0bLdn/DsSWBDETOr.V9WUmJ8QKBCUtXmEpXaItfWZW3FO.	login	2025-11-14 21:00:03.683278	2025-11-14 21:04:50.376	2025-11-14 20:59:50.398038	t	0	f
51b0dc8c-daa2-44fa-b2ab-62dc42964f57	9811890941	+91	$2b$05$6GNQGWvdH/v5DIy9M86akOA607zTocKrUlO/WxraFhdUSHLpam.6G	login	2025-11-14 21:08:34.615325	2025-11-14 21:13:22.253	2025-11-14 21:08:22.312189	t	0	f
f8b1e0da-a4ea-4199-89ae-de8496d5f579	9811890941	+91	$2b$05$aBmkqNjmVvNEUFf/NI0fDOjFyeynOS.3AaWMxtz3PhAwFvojO0y8K	login	2025-11-14 21:10:57.031555	2025-11-14 21:15:44.485	2025-11-14 21:10:44.495832	t	0	f
dfb1fa96-88fb-48c3-8060-cdbf73a35b0a	1234567890	+91	$2b$05$CX9IbdkldKUHfdX.xUj4Ter6rxjfu46lvtB4dXEGIdeYAqDXZb1zK	login	2025-11-14 22:09:58.978037	2025-11-14 22:14:46.678	2025-11-14 22:09:46.691542	t	0	f
b05ff81d-d886-4e98-ac11-2f8ade4173c2	1234567890	+91	$2b$05$oFXZYErX7lQkBQJ3SKLhNO6OE52kRI1EK55eN53qKmcQc7RVuJKEu	login	2025-11-15 11:25:36.378158	2025-11-15 11:30:16.371	2025-11-15 11:25:16.389784	t	0	f
76415767-4168-411e-8409-a45043f22138	1234567890	+91	$2b$05$nCcDTPVlZUZl1wuKqwzCb.HF4BhQ9QmantCumyRVxYVMJpd24KIEO	login	2025-11-15 12:35:24.035269	2025-11-15 12:40:08.948	2025-11-15 12:35:08.980677	t	0	f
75d782b7-ff25-42b2-8ec7-60b3d2cc755c	1234567890	+91	$2b$05$dCuiYrByUeAEimomgbzStuVbyya7h45Q0u4ct6QJnwcDR22Np70Uu	login	2025-11-15 19:53:54.45465	2025-11-15 19:58:41.141	2025-11-15 19:53:41.280458	t	0	f
3a8df911-0213-4865-a8fd-3d791bf30370	1234567890	+91	$2b$05$yHXjtGsdTjpikzjHaWSNzOXlvLJnIW9lDql1SEml96tVfzumXGcN2	login	2025-11-15 20:09:50.841627	2025-11-15 20:14:35.951	2025-11-15 20:09:36.012732	t	0	f
49d09d1c-a660-4b03-8c89-5d7ed7a4239c	1234567890	+91	$2b$05$YZf0vl6YFmArALCDcuy8V.e1FTF16csj0QdCAAn8WKT53ZG0M.PfK	login	2025-11-15 20:12:29.233001	2025-11-15 20:17:15.809	2025-11-15 20:12:15.867197	t	0	f
7ad5d9c3-8906-4084-9683-80df96132d26	1234567890	+91	$2b$05$/w.kzDzAtQ4/7tb04/UGI.CiQUBoDOHVl90m6Fo8hslHqcrlcNaza	login	2025-11-16 09:45:56.734872	2025-11-16 09:50:42.081	2025-11-16 09:45:42.128617	t	0	f
fb13af45-cbcc-4f33-a22e-d0221bac7158	1234567890	+91	$2b$05$j6/WghRzP9UTrE7FENtqB.z2hdlUMBx7glZw..D3B5PDehzoJssdW	login	2025-11-16 11:08:00.156336	2025-11-16 11:12:43.876	2025-11-16 11:07:43.909627	t	0	f
78e72aca-1494-4590-861d-43d484e5c906	1234567890	+91	$2b$05$x6QHbp3dmTJNku4yxoiW8uO15DtOCwqNgCp9Ek/MOVdYDRpiqzG9C	login	2025-11-16 12:07:54.70012	2025-11-16 12:12:43.824	2025-11-16 12:07:43.893557	t	0	f
d460b65e-01c3-4bfd-9b33-90cc98ff3a55	1234567890	+91	$2b$05$3tNfs2x7vPeB3CErZazyi.3EBzElpo.j70aa1AfUExx8kIvXOyrb6	login	2025-11-16 12:48:51.617836	2025-11-16 12:53:39.236	2025-11-16 12:48:39.29905	t	0	f
13071d48-6a1d-41c6-b66e-7588495bcd54	1234567890	+91	$2b$05$MlxDky2NtpVokp42E/WaG.UNvQKBZD1V.qRSYq0nzdHQhaLplI0rG	login	2025-11-16 12:54:21.982435	2025-11-16 12:59:08.743	2025-11-16 12:54:08.787332	t	0	f
e1eccb66-8fdf-4e10-8a53-a669a4908f71	1234567890	+91	$2b$05$mCiHgfTStKEfcqQTVcqbzuuOyHLoV5Dh/iub2r.b45TVSifDI8NT6	login	2025-11-16 14:13:02.863726	2025-11-16 14:17:49.159	2025-11-16 14:12:49.229046	t	0	f
1e25102a-4091-4f53-a516-1625e62f5aa0	1234567890	+91	$2b$05$kcloj2BI5CcdgfFCY0RSzuyZeojTWPjaHMkLxR/71s5n9JjJXB1N6	login	2025-11-16 14:24:47.534922	2025-11-16 14:29:33.432	2025-11-16 14:24:33.588669	t	0	f
635b7408-3f2e-42b2-b462-ab831df46f65	1234567890	+91	$2b$05$Jc74/2EhXxev5W5u0vZmsOY5C/xl.lvA69GijfO6cks0NpIRmVs/2	login	2025-11-16 14:50:27.10647	2025-11-16 14:55:14.111	2025-11-16 14:50:14.12325	t	0	f
b4aa3e29-4f12-4ee4-9992-e6036ddb024f	1234567890	+91	$2b$05$8HEnI0fybvBDRlc6b7l4O.qWjkSEyjGZjIO6vrJo3.ZFXGf5LUBq.	login	2025-11-16 16:40:25.222526	2025-11-16 16:45:13.872	2025-11-16 16:40:13.899965	t	0	f
d306fc81-7674-46db-be0f-e716424d426f	1234567890	+91	$2b$05$6mU04rJXWFFvbE6gNpeXK.LPDJjUnwkAxWdZOD/X8gz88DlMiojHa	login	2025-11-16 16:46:51.430971	2025-11-16 16:51:39.731	2025-11-16 16:46:39.812422	t	0	f
\.


--
-- Data for Name: partner_analytics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_analytics (id, organization_id, store_id, metric_type, metric_data, period_start, period_end, aggregation_level, created_at) FROM stdin;
\.


--
-- Data for Name: partner_auth; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_auth (id, partner_id, password_hash, created_at, updated_at) FROM stdin;
b0bc97e4-88f3-49d9-bc98-25e62eb5c6b2	00993477-9d54-4288-81a2-86f684a49329	$2b$12$UcZVNlI2VuIDte3.5mpmoeSw9r59EeLFCJckY3a3T1p7EKA9ymlEW	2025-11-11 21:16:31.772243	2025-11-11 21:16:31.772243
489bf3aa-0ecd-4594-8688-bad25894e8a3	7aca92cd-5679-4f57-b849-6b751a0b09b6	$2b$12$w7YNOju3L1vcYFgp5ZrMc.KIUa3I19Knsy90kk4VfkRqZIWy/hYVG	2025-11-12 08:28:24.904247	2025-11-12 08:28:24.904247
1af48f20-db1c-4ecf-80cf-bcd16ebed610	99b2336d-9f6a-443d-bc4e-8ff46f9db147	$2b$12$bdakLQCicbnYZ3J6XEmtIuhUGqPnjtvm.lDc2vBsWkEuHWS1TZVlO	2025-11-12 09:13:53.726889	2025-11-12 09:13:53.726889
7ff93457-f50a-4f93-a611-ca8a3249f780	59597291-826a-48f6-b3e0-6f2f19892d9e	$2b$12$fXa2RPn2/5L/NKKW2lZ.RezS0l9PsVEsENyTc4aZQkkROKzhSkd92	2025-11-12 17:33:17.824634	2025-11-12 17:33:17.824634
d203cd7d-e353-4646-986d-0d40a74412c2	e178e5af-906c-4c6b-bf39-e116d8c97cae	$2b$12$cvs9qX4TIaa05I1IuhEk.u9gM6gHCRa/AK4aVfp572n4htzOu5E2y	2025-11-14 20:18:07.919936	2025-11-14 20:18:07.919936
\.


--
-- Data for Name: partner_category_metadata; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_category_metadata (id, partner_id, category_id, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: partner_hours; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_hours (id, partner_id, day_of_week, opens_at, closes_at, is_closed, created_at) FROM stdin;
\.


--
-- Data for Name: partner_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_images (id, partner_id, image_url, image_type, display_order, created_at) FROM stdin;
\.


--
-- Data for Name: partner_offers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_offers (id, partner_id, title, description, discount_percentage, discount_amount, original_price, discounted_price, offer_type, terms_conditions, image_url, start_date, end_date, is_active, is_trending, max_redemptions, current_redemptions, applicable_categories, min_purchase_amount, promo_code, created_at, updated_at, service_type, applicable_days, is_promoted, featured_request_pending, forced_by_admin, menu_item_id, applicable_menu_items, discount_applies_to, savings, ezt_equivalent) FROM stdin;
23130fcf-d631-40a8-8e59-881dda74b164	e178e5af-906c-4c6b-bf39-e116d8c97cae	Dental Implant	Implant Oestumm with Crown	\N	5000.00	25000.00	20000.00	fixed_amount	daant patwaayo aur lagwayo	/uploads/offers/dentalmakeover.webp	2025-11-14 20:29:00	2026-11-18 20:29:00	t	f	\N	0	\N	\N	\N	2025-11-14 20:29:56.2497	2025-11-14 22:11:55.902913	healthcare	{monday,tuesday,wednesday,thursday,friday,saturday}	t	f	t	\N	\N	standalone	5000.00	50.00
1d34f4f9-fcc9-4e11-a230-286d12c8a4d0	99b2336d-9f6a-443d-bc4e-8ff46f9db147	breakfast unlimited	sab kuchh khaayo	\N	250.00	1000.00	750.00	fixed_amount	nil	/uploads/offers/WhatsAppImage2025-11-09at17.58.08.jpeg	2025-11-12 09:15:00	2025-12-31 09:15:00	t	t	\N	1	\N	\N	\N	2025-11-12 09:15:26.638401	2025-11-12 09:15:26.638401	dining	{monday,tuesday,wednesday,thursday,friday}	f	f	f	\N	\N	standalone	250.00	2.50
ec68caf2-bc6a-4ba4-916d-a3a4a7ff7beb	00993477-9d54-4288-81a2-86f684a49329	Daily Dinner buffet	Veg or Non.Veg dinner buffet from 7:30 PM till 11:00 PM 	24.00	\N	1050.00	798.00	percentage	koi khaas condition nahi	/uploads/offers/GeneratedImageOctober202025-8_47AM.png	2025-11-01 08:41:00	2025-11-30 08:41:00	t	t	\N	0	\N	\N	\N	2025-11-12 08:42:35.559052	2025-11-12 08:43:01.031807	dining	{monday,tuesday,wednesday,thursday,friday,saturday,sunday}	f	f	f	\N	\N	standalone	252.00	2.52
5315d973-dfe1-442d-8ecb-51b4580e8926	00993477-9d54-4288-81a2-86f684a49329	New Year Event-Welcome 26	New Year Event from 7:30 PM-11:59 PM 31/12/2026	25.00	\N	2500.00	1875.00	percentage	bla bla bla...	/uploads/offers/WhatsAppImage2025-11-01at23.19.41.jpeg	2025-12-31 19:30:00	2025-12-31 23:59:00	t	f	\N	1	\N	\N	\N	2025-11-12 08:47:07.191774	2025-11-14 21:15:05.695955	events	{wednesday}	f	f	f	\N	\N	standalone	625.00	6.25
\.


--
-- Data for Name: partner_organizations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_organizations (id, name, type, parent_org_id, tier_level, organization_code, description, address, contact_info, business_license, tax_id, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: partner_otps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_otps (id, partner_id, otp, type, expires_at, is_used, created_at) FROM stdin;
\.


--
-- Data for Name: partner_stores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_stores (id, organization_id, parent_store_id, store_name, store_code, store_type, address, contact_info, local_manager_id, opening_date, closing_date, store_hours, capacity, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: partner_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partner_users (id, organization_id, user_type, permissions, access_level, can_create_sub_orgs, can_approve_changes, budget_limit, is_active, created_at, updated_at, email, first_name, last_name) FROM stdin;
\.


--
-- Data for Name: partners; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partners (id, name, description, category_id, address, latitude, longitude, phone_number, website_url, email, partner_discount_percentage, is_active, nfc_tag_id, partner_category_type, rating, review_count, partner_code, created_at, updated_at, approved_for_featured) FROM stdin;
00993477-9d54-4288-81a2-86f684a49329	Hermanos	\N	536fc5f1-bb76-4a45-83a2-a6957cf48a89	Broadway, Sec 70A Gurgaon	0.00000000	0.00000000	9999999999	\N	hermanos70A@gmail.com	10.00	t	\N	\N	\N	0	\N	2025-11-11 21:16:31.772243	2025-11-11 21:16:31.772243	f
99b2336d-9f6a-443d-bc4e-8ff46f9db147	the owlet	\N	536fc5f1-bb76-4a45-83a2-a6957cf48a89	ninex mall	0.00000000	0.00000000	0987654321	\N	the-owlet@outlook.com	10.00	t	\N	\N	\N	0	\N	2025-11-12 09:13:53.726889	2025-11-12 09:13:53.726889	f
59597291-826a-48f6-b3e0-6f2f19892d9e	PVR INOX-sakshi	\N	e28cfb77-a2b1-400c-a1b2-9b7e511a4401	M3M Urbana	0.00000000	0.00000000	3333333333	\N	sakshihingoorani@gmail.com	10.00	t	\N	\N	\N	0	\N	2025-11-12 17:33:17.824634	2025-11-14 19:57:29.394166	f
e178e5af-906c-4c6b-bf39-e116d8c97cae	dental makeovers	\N	bac7cbe5-c691-4614-be61-1712a69ae836	B4GF, mayfield Gardens	0.00000000	0.00000000	1111111111	\N	bachchittarsingh@gmail.com	10.00	t	\N	\N	\N	0	\N	2025-11-14 20:18:07.919936	2025-11-14 20:18:41.614422	f
7aca92cd-5679-4f57-b849-6b751a0b09b6	The Epicenter	\N	e28cfb77-a2b1-400c-a1b2-9b7e511a4401	Sec 43 Gurgaon	0.00000000	0.00000000	2222222222	\N	bijlisarkar1978@gmail.com	10.00	t	\N	\N	\N	0	\N	2025-11-12 08:28:24.904247	2025-11-15 11:33:36.172875	f
\.


--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_methods (id, user_id, payment_type, token_reference, last_four, card_brand, is_default, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: pre_order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pre_order_items (id, pre_order_id, menu_item_id, quantity, unit_price, total_price, special_instructions, created_at) FROM stdin;
\.


--
-- Data for Name: pre_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pre_orders (id, user_id, partner_id, reservation_id, order_date, order_time, total_amount, status, special_instructions, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: prescriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.prescriptions (id, appointment_id, professional_id, customer_id, diagnosis, symptoms, medications, instructions, follow_up_date, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: professionals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.professionals (id, partner_id, first_name, last_name, email, phone, specialization, experience_years, qualifications, bio, profile_image_url, consultation_fee, rating, total_reviews, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: quality_standards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.quality_standards (id, organization_id, standard_type, standard_name, standard_description, compliance_requirements, audit_frequency, is_mandatory, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: referral_codes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.referral_codes (id, user_id, code, bonus_tokens, max_uses, current_uses, is_active, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: referrals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.referrals (id, referrer_id, referred_user_id, referral_code_id, bonus_credited_to_referrer, bonus_credited_to_referred, referrer_bonus, referred_bonus, created_at) FROM stdin;
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reviews (id, customer_id, professional_id, service_id, appointment_id, rating, review_text, is_verified, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, role_name) FROM stdin;
2768b3be-0ab4-4a7b-883f-291bdea8c717	super_admin
9a0d5533-f5a5-4b55-a7b8-3000524b9835	partner_admin
d453cecd-2904-4e79-80d7-637f9195a6e1	user
\.


--
-- Data for Name: screens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.screens (id, theatre_id, partner_id, name, total_seats, is_active, created_at, updated_at) FROM stdin;
f06ad454-7dd3-413a-8be1-559b45e891b2	bf2fa1ee-d425-43e1-9d72-526189fde808	59597291-826a-48f6-b3e0-6f2f19892d9e	Atoms	240	t	2025-11-16 09:48:09.195677	2025-11-16 09:48:09.195677
5dd7ff3d-de20-4022-a5de-178abe48a9f3	bf2fa1ee-d425-43e1-9d72-526189fde808	59597291-826a-48f6-b3e0-6f2f19892d9e	Atoms	240	t	2025-11-16 09:49:07.652827	2025-11-16 09:49:07.652827
b0f3fdaf-a697-4bdd-b175-bbbc1d0c70c1	5b30997d-d698-4c12-81a2-beab2a9734cc	59597291-826a-48f6-b3e0-6f2f19892d9e	Atoms	240	t	2025-11-16 11:08:51.892138	2025-11-16 11:08:51.892138
\.


--
-- Data for Name: service_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_categories (id, name, slug, description, icon, created_at, display_order) FROM stdin;
fdeb2e22-e53a-4ed7-8e61-686917420618	Dining	dining	Restaurant services, food delivery, and dining experiences	🍽️	2025-10-21 07:57:23.498143	0
57120dba-496c-4e2f-99b8-d7118afc24e6	Events	events	Concerts, shows, performances, and entertainment events	🎵	2025-10-21 07:57:23.498143	0
d7784730-5b7c-4867-99a7-ed5b851c022d	Spa and Salon	spa-and-salon	Hair, beauty, spa treatments, and personal care services	💅	2025-10-21 07:57:23.498143	0
ea70f947-650a-4c33-a0ed-deea2e80c929	Wellness	wellness	Health, fitness, medical services, and wellness activities	🏥	2025-10-21 07:57:23.498143	0
52d1dbf6-5d2b-4cea-8433-ce8f7d512c72	Travel	travel	Travel services, tours, accommodation, and transportation	✈️	2025-10-21 09:57:50.920245	0
e8f5672d-9c74-477a-889a-ec2e325d2b07	Others	others	Miscellaneous services and other categories	📦	2025-10-21 09:57:50.920245	0
\.


--
-- Data for Name: service_subcategories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_subcategories (id, service_type, name, description, iso_reference, is_active, created_at, updated_at) FROM stdin;
1	events	Corporate / Business Events (MICE)	Conferences, trade fairs, product launches	ISO 18513:2003 §3.8	t	2025-11-01 15:51:10.788124	2025-11-01 15:51:10.788124
2	events	Social Events	Weddings, birthdays, family gatherings	ISO 18513:2003 §3.12	t	2025-11-01 15:51:10.788124	2025-11-01 15:51:10.788124
3	events	Cultural & Entertainment Events	Concerts, theater, film screenings, comedy nights	NAICS 7113	t	2025-11-01 15:51:10.788124	2025-11-01 15:51:10.788124
4	events	Educational Events & Workshops	Seminars, lectures, and training sessions	ISIC 8559	t	2025-11-01 15:51:10.788124	2025-11-01 15:51:10.788124
5	events	Sports & Fitness Events	Marathons, tournaments, yoga camps	ISIC 9319	t	2025-11-01 15:51:10.788124	2025-11-01 15:51:10.788124
6	events	Festivals & Fairs	Art, craft, and food festivals	ISO 18513:2003 §3.9	t	2025-11-01 15:51:10.788124	2025-11-01 15:51:10.788124
7	events	Charity & Fundraisers	Community and non-profit fundraising events	ISIC 8899	t	2025-11-01 15:51:10.788124	2025-11-01 15:51:10.788124
8	spa-and-salon	Hairdressing & Styling	Haircuts, coloring, and styling	ISIC 9602	t	2025-11-01 15:51:10.79041	2025-11-01 15:51:10.79041
9	spa-and-salon	Facial & Skincare Treatments	Facials, exfoliation, peels	ISIC 9602	t	2025-11-01 15:51:10.79041	2025-11-01 15:51:10.79041
10	spa-and-salon	Massage & Body Therapy	Swedish, Thai, deep tissue massage	ISO 18513:2003 §3.13	t	2025-11-01 15:51:10.79041	2025-11-01 15:51:10.79041
11	spa-and-salon	Aromatherapy & Reflexology	Essential oil and reflex point therapies	ISIC 9604	t	2025-11-01 15:51:10.79041	2025-11-01 15:51:10.79041
12	spa-and-salon	Nail Care & Beauty	Manicure, pedicure, nail art	ISIC 9602	t	2025-11-01 15:51:10.79041	2025-11-01 15:51:10.79041
13	spa-and-salon	Make-up & Grooming	Make-up, waxing, bridal grooming	ISIC 9602	t	2025-11-01 15:51:10.79041	2025-11-01 15:51:10.79041
14	spa-and-salon	Men's Grooming & Barber Services	Beard styling, shaves, trims	ISIC 9602	t	2025-11-01 15:51:10.79041	2025-11-01 15:51:10.79041
15	spa-and-salon	Spa Packages & Day Spa	Full-day spa and relaxation packages	ISO 18513:2003 §3.13	t	2025-11-01 15:51:10.79041	2025-11-01 15:51:10.79041
16	wellness	Yoga & Meditation	Group and guided meditation sessions	WHO GWI §2.1	t	2025-11-01 15:51:10.79078	2025-11-01 15:51:10.79078
17	wellness	Ayurveda & Traditional Medicine	Panchakarma, Siddha, Unani treatments	WHO GWI §2.3	t	2025-11-01 15:51:10.79078	2025-11-01 15:51:10.79078
18	wellness	Rehabilitation & Physiotherapy	Post-injury or post-surgery rehabilitation	ISIC 8690	t	2025-11-01 15:51:10.79078	2025-11-01 15:51:10.79078
19	wellness	Holistic Healing & Energy Work	Reiki, sound healing, crystal therapy	WHO GWI §3.1	t	2025-11-01 15:51:10.79078	2025-11-01 15:51:10.79078
20	wellness	Mental Wellness & Counseling	Therapy, life coaching, mental health sessions	WHO GWI §4.2	t	2025-11-01 15:51:10.79078	2025-11-01 15:51:10.79078
21	wellness	Nutrition & Diet Counseling	Personalized nutrition and weight plans	WHO GWI §2.2	t	2025-11-01 15:51:10.79078	2025-11-01 15:51:10.79078
22	wellness	Wellness Retreats & Resorts	Destination-based rejuvenation programs	ISO 18513:2003 §3.10	t	2025-11-01 15:51:10.79078	2025-11-01 15:51:10.79078
23	wellness	Spa-Integrated Wellness	Medical and spa hybrid wellness centers	WHO GWI §2.4	t	2025-11-01 15:51:10.79078	2025-11-01 15:51:10.79078
24	travel	Leisure Travel	Domestic and international vacation packages	UNWTO §4.3	t	2025-11-01 15:51:10.791159	2025-11-01 15:51:10.791159
25	travel	Adventure Tourism	Trekking, rafting, diving, mountaineering	ISO 18513:2003 §3.15	t	2025-11-01 15:51:10.791159	2025-11-01 15:51:10.791159
26	travel	Cultural & Heritage Travel	Museums, monuments, heritage tours	ISO 18513:2003 §3.16	t	2025-11-01 15:51:10.791159	2025-11-01 15:51:10.791159
27	travel	Pilgrimage & Religious Travel	Faith-based travel packages	UNWTO Religious Tourism	t	2025-11-01 15:51:10.791159	2025-11-01 15:51:10.791159
28	travel	Eco & Sustainable Tourism	Nature lodges, eco-resorts, green travel	UNWTO §5.2	t	2025-11-01 15:51:10.791159	2025-11-01 15:51:10.791159
29	travel	Luxury & Premium Travel	Private jets, boutique resorts, cruises	ISO 18513:2003 §3.17	t	2025-11-01 15:51:10.791159	2025-11-01 15:51:10.791159
30	travel	Business Travel (MICE)	Corporate travel and incentive programs	UNWTO §6.1	t	2025-11-01 15:51:10.791159	2025-11-01 15:51:10.791159
31	travel	Cruise / Maritime Travel	Sea voyages, yacht charters	IATA CRS 4703	t	2025-11-01 15:51:10.791159	2025-11-01 15:51:10.791159
32	others	Pet Care & Grooming	Pet grooming, boarding, and training	ISIC 9609	t	2025-11-01 15:51:10.791763	2025-11-01 15:51:10.791763
33	others	Education & Training	Tutoring, online courses, skill training	ISIC 8559	t	2025-11-01 15:51:10.791763	2025-11-01 15:51:10.791763
34	others	Photography & Videography	Event or studio photography services	ISIC 7420	t	2025-11-01 15:51:10.791763	2025-11-01 15:51:10.791763
35	others	Home & Lifestyle Services	Cleaning, repair, interior services	ISIC 9609	t	2025-11-01 15:51:10.791763	2025-11-01 15:51:10.791763
36	others	Entertainment Professionals	DJs, emcees, performers	ISIC 9000	t	2025-11-01 15:51:10.791763	2025-11-01 15:51:10.791763
37	others	Equipment & Venue Rentals	Event gear, decor, or venue rentals	ISIC 7730	t	2025-11-01 15:51:10.791763	2025-11-01 15:51:10.791763
38	others	Consulting & Misc. Services	Specialized personal or B2B services	ISIC 7020	t	2025-11-01 15:51:10.791763	2025-11-01 15:51:10.791763
39	healthcare	General Physicians & Specialists	Medical consultations by registered doctors	ISIC 8620	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
40	healthcare	Hospitals & Clinics	Multi and super specialty centers	ISIC 8610	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
41	healthcare	Diagnostics & Labs	Pathology and sample collection	ISIC 8690	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
42	healthcare	Radiology & Imaging	X-ray, MRI, ultrasound, CT scan	ISIC 8690	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
43	healthcare	Dental Clinics	Dental and orthodontic treatments	ISIC 8620	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
44	healthcare	Physiotherapy & Rehabilitation	Post-surgery and recovery therapy	ISIC 8690	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
45	healthcare	Home Healthcare	Nursing and in-home telemedicine	ISIC 8690	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
46	healthcare	Pharmacies & Medicine Delivery	Prescription and OTC medication	ISIC 4772	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
47	healthcare	Teleconsultation / e-Clinic	Virtual doctor consultations	WHO mHealth	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
48	healthcare	Vaccination & Preventive Care	Immunization, health camps	WHO ICD-10 Z23	t	2025-11-01 16:12:00.390123	2025-11-01 16:12:00.390123
49	dining	Starters & Appetizers	Starter dishes and appetizers	NAICS 722511	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
50	dining	Main Course	Main course dishes	NAICS 722511	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
51	dining	Desserts	Sweet dishes and desserts	NAICS 722511	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
52	dining	Beverages	Drinks and beverages	NAICS 722515	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
53	dining	Fast Food	Quick service restaurants	NAICS 722513	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
54	dining	Fine Dining	Upscale dining experiences	NAICS 722511	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
55	dining	Cafe & Coffee	Coffee shops and cafes	NAICS 722515	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
56	dining	Bakery & Confectionery	Baked goods and sweets	NAICS 311811	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
57	dining	Street Food	Street food and local vendors	NAICS 722330	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
58	dining	Buffet	All-you-can-eat buffet style	NAICS 722511	t	2025-11-01 22:57:27.255457	2025-11-01 22:57:27.255457
\.


--
-- Data for Name: standardization_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.standardization_templates (id, organization_id, template_type, template_name, template_data, is_mandatory, can_be_customized, customization_rules, created_by, created_at, updated_at, is_active) FROM stdin;
\.


--
-- Data for Name: support_tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.support_tickets (id, user_id, subject, description, category_id, status, priority, created_at, updated_at, resolved_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_settings (id, setting_key, setting_value, description, updated_by, updated_at) FROM stdin;
cfab3cd4-fc3d-4561-b2b0-b3c56531d9d9	loyalty_multiplier	1	Points earned per ₹100 spent (default: 1 point per ₹100)	\N	2025-11-12 08:48:18.69764
6e11fb32-b43c-460a-8454-9bfd41ffb1a7	commission_percentage	10.0	Default commission percentage for partners	\N	2025-11-12 08:48:18.69764
ca1ac64d-4894-4b58-aad2-e5f8780f788e	voucher_expiry_days	30	Voucher expiry in days from booking date	\N	2025-11-12 08:48:18.69764
40e784cf-bb2e-46e9-83e1-2f250af6a4f8	archive_expired_after_days	7	Auto-archive offers after X days of expiry	\N	2025-11-12 08:48:18.69764
251faa22-453e-4eb0-9333-2b8e23017277	platform_name	Elizian	\N	29818457-71df-4302-8634-52e11814266b	2025-11-12 09:14:11.719584
27678d10-d870-4707-a93a-7b874fa855b9	default_commission	10	\N	29818457-71df-4302-8634-52e11814266b	2025-11-12 09:14:11.719584
1e493ebc-16d6-4848-aca8-bb2fcf107b7b	max_promoted_deals	12	\N	29818457-71df-4302-8634-52e11814266b	2025-11-12 09:14:11.719584
21c891c8-a15a-4b03-aa3f-9dcfc7aa9312	deal_approval_required	true	\N	29818457-71df-4302-8634-52e11814266b	2025-11-12 09:14:11.719584
d59c440c-ebd7-4534-a210-0d3b007e4d0d	partner_auto_approval	true	\N	29818457-71df-4302-8634-52e11814266b	2025-11-12 09:14:11.719584
78f5abc1-5256-4aff-bccd-7724fcf9841e	loyalty_points_per_txn	1	\N	29818457-71df-4302-8634-52e11814266b	2025-11-12 09:14:11.719584
24d993b7-8f8b-4e4c-9e1e-23c1a67ec6ea	loyalty_rupees_per_point	100	\N	29818457-71df-4302-8634-52e11814266b	2025-11-12 09:14:11.719584
\.


--
-- Data for Name: theatres; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.theatres (id, partner_id, name, slug, address, city, state, country, timezone, created_at, updated_at) FROM stdin;
5b30997d-d698-4c12-81a2-beab2a9734cc	59597291-826a-48f6-b3e0-6f2f19892d9e	CheePeeAar-Chinox	cheepeeaar-chinox	{"city": "Gurgaon", "line1": "TowerlMark", "line2": "Sector 66", "state": "Haryana", "country": "India", "pincode": "122018", "city_code": "Gurgaon", "state_code": "HR", "country_code": "IN"}	Gurgaon	Haryana	India	Asia/Kolkata	2025-11-15 21:29:52.240635	2025-11-15 21:29:52.240635
bf2fa1ee-d425-43e1-9d72-526189fde808	59597291-826a-48f6-b3e0-6f2f19892d9e	Chinox-CheePeeAar	chinox-cheepeeaar	{"city": "Gurgaon", "line1": "Worldmark", "line2": "Sec 66", "state": "Haryana", "country": "India", "pincode": "122018", "city_code": "Gurgaon", "state_code": "HR", "country_code": "IN"}	Gurgaon	Haryana	India	Asia/Kolkata	2025-11-16 09:47:40.540039	2025-11-16 09:47:40.540039
\.


--
-- Data for Name: tier_progress; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tier_progress (id, user_id, current_tier_id, previous_tier_id, total_spend, progress_percentage, promoted_at, updated_at) FROM stdin;
0fea164b-b3c2-4cfe-aca8-84c632ea55f5	29818457-71df-4302-8634-52e11814266b	172855b2-8cb7-4fa7-980a-49cf5edb5b26	\N	0.00	0.00	\N	2025-11-11 21:19:59.145556
c1102c20-a705-4f62-a7be-15151845c122	814b57ad-9952-4591-8a93-2d94bbe31f21	172855b2-8cb7-4fa7-980a-49cf5edb5b26	\N	0.00	0.00	\N	2025-11-12 08:33:17.199637
a736a9c0-d124-4112-b166-b2a2fccdc337	4eaca30f-53e3-4f94-94fa-f59478bfb804	172855b2-8cb7-4fa7-980a-49cf5edb5b26	\N	0.00	0.00	\N	2025-11-14 20:31:17.697755
\.


--
-- Data for Name: tiers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tiers (id, name, level, token_earning_percentage, min_spend_required, description, color_code, icon_url, created_at) FROM stdin;
172855b2-8cb7-4fa7-980a-49cf5edb5b26	Ather	1	1.00	0.00	Default tier	#B0BEC5	\N	2025-10-20 12:33:12.554564
2f93b1a5-df1c-4433-9cb0-8abd2af12b99	Nova	2	2.00	10000.00	Earned tier	#64B5F6	\N	2025-10-20 12:33:12.554564
8d606ef9-68b9-4527-80d1-326581b77524	Luminar	3	3.00	50000.00	Premium tier	#9575CD	\N	2025-10-20 12:33:12.554564
54810337-3d04-48d8-ab32-6827086ddbac	Valiant	4	4.00	150000.00	Elite tier	#66BB6A	\N	2025-10-20 12:33:12.554564
6276ad3b-b9c3-494e-b104-dfa6b686f077	Echelon	5	5.00	500000.00	Invite-only tier	#FFD54F	\N	2025-10-20 12:33:12.554564
\.


--
-- Data for Name: time_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.time_slots (id, professional_id, day_of_week, start_time, end_time, is_available, created_at) FROM stdin;
\.


--
-- Data for Name: token_ledger; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.token_ledger (id, user_id, transaction_id, amount, ledger_type, balance_before, balance_after, category_id, description, reference_id, created_at) FROM stdin;
f9fb083c-2dab-41ce-a608-53ebcb90ab84	29818457-71df-4302-8634-52e11814266b	\N	100.00000	airdrop	0.00000	100.00000	\N	Signup bonus credited (will sync with blockchain airdrop)	\N	2025-11-11 21:19:59.15023
7d644fc7-9cd4-4ea5-8b95-63b0a140f620	814b57ad-9952-4591-8a93-2d94bbe31f21	\N	100.00000	airdrop	0.00000	100.00000	\N	Signup bonus credited (will sync with blockchain airdrop)	\N	2025-11-12 08:33:17.205372
3fe41940-c081-4f1b-bd08-7e1e828b9ba0	814b57ad-9952-4591-8a93-2d94bbe31f21	\N	-6.25000	spent	100.00000	93.75000	\N	Redeemed for discount on Booking 5315d973-dfe1-442d-8ecb-51b4580e8926	\N	2025-11-12 08:48:18.752109
f77d9207-427e-449a-aaec-58a59b733e30	4eaca30f-53e3-4f94-94fa-f59478bfb804	\N	100.00000	airdrop	0.00000	100.00000	\N	Signup bonus credited (will sync with blockchain airdrop)	\N	2025-11-14 20:31:17.702389
d25ac716-245b-45ef-a5d2-7eeea264ac44	29818457-71df-4302-8634-52e11814266b	\N	-2.50000	spent	100.00000	97.50000	\N	Redeemed for discount on Booking 1d34f4f9-fcc9-4e11-a230-286d12c8a4d0	\N	2025-11-14 22:12:28.346709
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, user_id, partner_id, category_id, check_in_id, bill_amount, discount_percentage, discount_amount, amount_after_discount, tokens_redeemed, tokens_earned, net_token_change, user_tier_at_transaction, transaction_type, payment_source, payment_method, payment_status, app2_transaction_id, webhook_signature, notes, created_at, updated_at) FROM stdin;
1b94b489-2de3-4e3d-9863-75f81c15ea9d	814b57ad-9952-4591-8a93-2d94bbe31f21	00993477-9d54-4288-81a2-86f684a49329	536fc5f1-bb76-4a45-83a2-a6957cf48a89	\N	2500.00	25.00	625.00	1875.00	6.25000	0.00000	-6.25000	172855b2-8cb7-4fa7-980a-49cf5edb5b26	booking	app2	\N	completed	DB1762917498770E31F21W2C588	\N	\N	2025-11-12 08:48:18.752109	2025-11-12 08:48:18.752109
0f4c8ad2-4ad3-4e9a-a4f1-38bc98e16453	29818457-71df-4302-8634-52e11814266b	99b2336d-9f6a-443d-bc4e-8ff46f9db147	536fc5f1-bb76-4a45-83a2-a6957cf48a89	\N	1000.00	25.00	250.00	750.00	2.50000	0.00000	-2.50000	172855b2-8cb7-4fa7-980a-49cf5edb5b26	booking	app2	\N	completed	DB176313854836514266BRVTUNA	\N	\N	2025-11-14 22:12:28.346709	2025-11-14 22:12:28.346709
\.


--
-- Data for Name: user_achievements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_achievements (id, user_id, achievement_id, achieved_at) FROM stdin;
\.


--
-- Data for Name: user_auth_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_auth_credentials (id, user_id, password_hash, phone_verified, email_verified, phone_verified_at, email_verified_at, last_password_change, password_reset_token, password_reset_expires, failed_login_attempts, account_locked_until, created_at, updated_at) FROM stdin;
48c303ab-66ee-4d88-aee3-9f087b710a66	29818457-71df-4302-8634-52e11814266b	$2b$10$JY.S5gC4IwT7pV9HwJ4t7.xk4fD/1EXTRjQMV0k4LHlv66cPXtm3i	f	t	\N	\N	\N	\N	\N	0	\N	2025-11-11 21:19:59.148042	2025-11-11 21:19:59.148042
f531e936-8f38-40f2-a886-3ff71780b3a8	814b57ad-9952-4591-8a93-2d94bbe31f21	$2b$10$ao7kw03rzc.BG2LgdEs9Oeg52.J2Ea7sYuLLV786TIfGOSETninWC	f	f	\N	\N	\N	\N	\N	0	\N	2025-11-12 08:33:17.20291	2025-11-12 08:33:17.20291
\.


--
-- Data for Name: user_category_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_category_preferences (id, user_id, category_id, is_interested, notification_enabled, created_at) FROM stdin;
\.


--
-- Data for Name: user_partner_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_partner_connections (id, user_id, partner_id, category_id, is_connected, favorite, total_visits, total_spend, last_visit, connected_at) FROM stdin;
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_sessions (id, user_id, access_token, refresh_token, expires_at, device_id, device_name, ip_address, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, phone_number, country_code, email, first_name, last_name, profile_photo_url, address, city, state_province, country, postal_code, date_of_birth, gender, anniversary_date, current_tier_id, total_tokens_earned, total_tokens_spent, available_tokens, total_spend, firebase_uid, is_active, created_at, updated_at, last_login, signup_bonus_credited, role_id) FROM stdin;
814b57ad-9952-4591-8a93-2d94bbe31f21	1234567890	+91	mohit.bansal@elizian.xyz	Mohit	Bansal	\N	\N	\N	\N	\N	\N	\N	\N	\N	172855b2-8cb7-4fa7-980a-49cf5edb5b26	100.00000	6.25000	93.75000	0.00	\N	t	2025-11-12 08:33:17.192976	2025-11-12 08:48:18.752109	\N	t	d453cecd-2904-4e79-80d7-637f9195a6e1
4eaca30f-53e3-4f94-94fa-f59478bfb804	9811890941	+91	\N	Nishu	verma	\N	\N	\N	\N	\N	\N	\N	\N	\N	172855b2-8cb7-4fa7-980a-49cf5edb5b26	100.00000	0.00000	100.00000	0.00	\N	t	2025-11-14 20:31:17.692219	2025-11-14 20:31:17.702389	\N	t	d453cecd-2904-4e79-80d7-637f9195a6e1
29818457-71df-4302-8634-52e11814266b	9910241176	+91	mailfornishantverma@gmail.com	nishant	verma	\N	\N	\N	\N	\N	\N	\N	\N	\N	172855b2-8cb7-4fa7-980a-49cf5edb5b26	100.00000	2.50000	97.50000	0.00	\N	t	2025-11-11 21:19:59.140396	2025-11-14 22:12:28.346709	\N	t	2768b3be-0ab4-4a7b-883f-291bdea8c717
\.


--
-- Data for Name: vouchers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vouchers (id, booking_id, event_id, partner_id, code, qr_code_url, qr_code_data, status, redeemed_by_partner_id, redeemed_at, expires_at, created_at, updated_at) FROM stdin;
5bfdc579-b466-403f-bc3b-5bec848440fe	e668aff7-8662-4757-b6b1-1c58ee2069f5	\N	00993477-9d54-4288-81a2-86f684a49329	VCH-21W2C588-4CZR	\N	data:image/png;base64,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	active	\N	\N	2025-12-12 08:48:18.787	2025-11-12 08:48:18.860538	2025-11-12 08:48:18.860538
de9bfd52-aa86-4168-9006-a1344193b922	318bedce-b347-4005-804b-899d77dc3a1f	\N	99b2336d-9f6a-443d-bc4e-8ff46f9db147	VCH-6BRVTUNA-MOO1	\N	data:image/png;base64,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	active	\N	\N	2025-12-14 22:12:28.388	2025-11-14 22:12:28.457438	2025-11-14 22:12:28.457438
\.


--
-- Data for Name: webhook_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.webhook_logs (id, event_type, source_app, category_id, payload, signature, is_verified, status, error_message, retry_count, received_at, processed_at) FROM stdin;
\.


--
-- Name: service_subcategories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.service_subcategories_id_seq', 1, false);


--
-- Name: cinemas cinemas_pkey; Type: CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.cinemas
    ADD CONSTRAINT cinemas_pkey PRIMARY KEY (id);


--
-- Name: movies movies_pkey; Type: CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.movies
    ADD CONSTRAINT movies_pkey PRIMARY KEY (id);


--
-- Name: screens screens_pkey; Type: CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.screens
    ADD CONSTRAINT screens_pkey PRIMARY KEY (id);


--
-- Name: seat_bookings seat_bookings_pkey; Type: CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seat_bookings
    ADD CONSTRAINT seat_bookings_pkey PRIMARY KEY (id);


--
-- Name: seat_bookings seat_bookings_show_id_seat_id_key; Type: CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seat_bookings
    ADD CONSTRAINT seat_bookings_show_id_seat_id_key UNIQUE (show_id, seat_id);


--
-- Name: seats seats_pkey; Type: CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seats
    ADD CONSTRAINT seats_pkey PRIMARY KEY (id);


--
-- Name: seats seats_screen_id_row_label_seat_number_key; Type: CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seats
    ADD CONSTRAINT seats_screen_id_row_label_seat_number_key UNIQUE (screen_id, row_label, seat_number);


--
-- Name: shows shows_pkey; Type: CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.shows
    ADD CONSTRAINT shows_pkey PRIMARY KEY (id);


--
-- Name: achievements achievements_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_name_key UNIQUE (name);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: approval_workflows approval_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_workflows
    ADD CONSTRAINT approval_workflows_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: beverage_categories beverage_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beverage_categories
    ADD CONSTRAINT beverage_categories_pkey PRIMARY KEY (id);


--
-- Name: beverage_categories beverage_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beverage_categories
    ADD CONSTRAINT beverage_categories_slug_key UNIQUE (slug);


--
-- Name: bookings bookings_booking_reference_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_reference_key UNIQUE (booking_reference);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: check_ins check_ins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_pkey PRIMARY KEY (id);


--
-- Name: compliance_audits compliance_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_audits
    ADD CONSTRAINT compliance_audits_pkey PRIMARY KEY (id);


--
-- Name: customers customers_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_email_key UNIQUE (email);


--
-- Name: customers customers_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: deal_slots deal_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_slots
    ADD CONSTRAINT deal_slots_pkey PRIMARY KEY (id);


--
-- Name: dish_categories dish_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dish_categories
    ADD CONSTRAINT dish_categories_pkey PRIMARY KEY (id);


--
-- Name: dish_categories dish_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dish_categories
    ADD CONSTRAINT dish_categories_slug_key UNIQUE (slug);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_key UNIQUE (token);


--
-- Name: event_attributes event_attributes_event_id_attribute_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_attributes
    ADD CONSTRAINT event_attributes_event_id_attribute_type_key UNIQUE (event_id, attribute_type);


--
-- Name: event_attributes event_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_attributes
    ADD CONSTRAINT event_attributes_pkey PRIMARY KEY (id);


--
-- Name: event_bookings event_bookings_booking_reference_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_bookings
    ADD CONSTRAINT event_bookings_booking_reference_key UNIQUE (booking_reference);


--
-- Name: event_bookings event_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_bookings
    ADD CONSTRAINT event_bookings_pkey PRIMARY KEY (id);


--
-- Name: event_categories event_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);


--
-- Name: event_categories event_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_slug_key UNIQUE (slug);


--
-- Name: event_subcategories event_subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_subcategories
    ADD CONSTRAINT event_subcategories_pkey PRIMARY KEY (id);


--
-- Name: event_subcategories event_subcategories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_subcategories
    ADD CONSTRAINT event_subcategories_slug_key UNIQUE (slug);


--
-- Name: event_tag_mappings event_tag_mappings_event_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tag_mappings
    ADD CONSTRAINT event_tag_mappings_event_id_tag_id_key UNIQUE (event_id, tag_id);


--
-- Name: event_tag_mappings event_tag_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tag_mappings
    ADD CONSTRAINT event_tag_mappings_pkey PRIMARY KEY (id);


--
-- Name: event_tags event_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tags
    ADD CONSTRAINT event_tags_pkey PRIMARY KEY (id);


--
-- Name: event_tags event_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tags
    ADD CONSTRAINT event_tags_slug_key UNIQUE (slug);


--
-- Name: event_tickets event_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tickets
    ADD CONSTRAINT event_tickets_pkey PRIMARY KEY (id);


--
-- Name: event_tickets event_tickets_ticket_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tickets
    ADD CONSTRAINT event_tickets_ticket_code_key UNIQUE (ticket_code);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: food_categories food_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.food_categories
    ADD CONSTRAINT food_categories_name_key UNIQUE (name);


--
-- Name: food_categories food_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.food_categories
    ADD CONSTRAINT food_categories_pkey PRIMARY KEY (id);


--
-- Name: food_categories food_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.food_categories
    ADD CONSTRAINT food_categories_slug_key UNIQUE (slug);


--
-- Name: food_menu_categories food_menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.food_menu_categories
    ADD CONSTRAINT food_menu_categories_pkey PRIMARY KEY (id);


--
-- Name: food_menu_categories food_menu_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.food_menu_categories
    ADD CONSTRAINT food_menu_categories_slug_key UNIQUE (slug);


--
-- Name: health_records health_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.health_records
    ADD CONSTRAINT health_records_pkey PRIMARY KEY (id);


--
-- Name: localization_settings localization_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.localization_settings
    ADD CONSTRAINT localization_settings_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: offer_schedule_days offer_schedule_days_offer_schedule_id_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedule_days
    ADD CONSTRAINT offer_schedule_days_offer_schedule_id_day_of_week_key UNIQUE (offer_schedule_id, day_of_week);


--
-- Name: offer_schedule_days offer_schedule_days_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedule_days
    ADD CONSTRAINT offer_schedule_days_pkey PRIMARY KEY (id);


--
-- Name: offer_schedule_menu_items offer_schedule_menu_items_offer_schedule_id_menu_item_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedule_menu_items
    ADD CONSTRAINT offer_schedule_menu_items_offer_schedule_id_menu_item_id_key UNIQUE (offer_schedule_id, menu_item_id);


--
-- Name: offer_schedule_menu_items offer_schedule_menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedule_menu_items
    ADD CONSTRAINT offer_schedule_menu_items_pkey PRIMARY KEY (id);


--
-- Name: offer_schedules offer_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedules
    ADD CONSTRAINT offer_schedules_pkey PRIMARY KEY (id);


--
-- Name: offer_usage offer_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_usage
    ADD CONSTRAINT offer_usage_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: otp_sessions otp_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otp_sessions
    ADD CONSTRAINT otp_sessions_pkey PRIMARY KEY (id);


--
-- Name: partner_analytics partner_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_analytics
    ADD CONSTRAINT partner_analytics_pkey PRIMARY KEY (id);


--
-- Name: partner_auth partner_auth_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_auth
    ADD CONSTRAINT partner_auth_pkey PRIMARY KEY (id);


--
-- Name: partner_category_metadata partner_category_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_category_metadata
    ADD CONSTRAINT partner_category_metadata_pkey PRIMARY KEY (id);


--
-- Name: partner_hours partner_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_hours
    ADD CONSTRAINT partner_hours_pkey PRIMARY KEY (id);


--
-- Name: partner_images partner_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_images
    ADD CONSTRAINT partner_images_pkey PRIMARY KEY (id);


--
-- Name: partner_offers partner_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_offers
    ADD CONSTRAINT partner_offers_pkey PRIMARY KEY (id);


--
-- Name: partner_organizations partner_organizations_organization_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_organizations
    ADD CONSTRAINT partner_organizations_organization_code_key UNIQUE (organization_code);


--
-- Name: partner_organizations partner_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_organizations
    ADD CONSTRAINT partner_organizations_pkey PRIMARY KEY (id);


--
-- Name: partner_otps partner_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_otps
    ADD CONSTRAINT partner_otps_pkey PRIMARY KEY (id);


--
-- Name: partner_stores partner_stores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_stores
    ADD CONSTRAINT partner_stores_pkey PRIMARY KEY (id);


--
-- Name: partner_stores partner_stores_store_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_stores
    ADD CONSTRAINT partner_stores_store_code_key UNIQUE (store_code);


--
-- Name: partner_users partner_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_users
    ADD CONSTRAINT partner_users_pkey PRIMARY KEY (id);


--
-- Name: partners partners_partner_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_partner_code_key UNIQUE (partner_code);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: pre_order_items pre_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pre_order_items
    ADD CONSTRAINT pre_order_items_pkey PRIMARY KEY (id);


--
-- Name: pre_orders pre_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pre_orders
    ADD CONSTRAINT pre_orders_pkey PRIMARY KEY (id);


--
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_pkey PRIMARY KEY (id);


--
-- Name: professionals professionals_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.professionals
    ADD CONSTRAINT professionals_email_key UNIQUE (email);


--
-- Name: professionals professionals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.professionals
    ADD CONSTRAINT professionals_pkey PRIMARY KEY (id);


--
-- Name: quality_standards quality_standards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quality_standards
    ADD CONSTRAINT quality_standards_pkey PRIMARY KEY (id);


--
-- Name: referral_codes referral_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_code_key UNIQUE (code);


--
-- Name: referral_codes referral_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);


--
-- Name: screens screens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_pkey PRIMARY KEY (id);


--
-- Name: service_categories service_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_pkey PRIMARY KEY (id);


--
-- Name: service_categories service_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_slug_key UNIQUE (slug);


--
-- Name: service_subcategories service_subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_subcategories
    ADD CONSTRAINT service_subcategories_pkey PRIMARY KEY (id);


--
-- Name: standardization_templates standardization_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.standardization_templates
    ADD CONSTRAINT standardization_templates_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: theatres theatres_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.theatres
    ADD CONSTRAINT theatres_pkey PRIMARY KEY (id);


--
-- Name: theatres theatres_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.theatres
    ADD CONSTRAINT theatres_slug_key UNIQUE (slug);


--
-- Name: tier_progress tier_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tier_progress
    ADD CONSTRAINT tier_progress_pkey PRIMARY KEY (id);


--
-- Name: tier_progress tier_progress_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tier_progress
    ADD CONSTRAINT tier_progress_user_id_key UNIQUE (user_id);


--
-- Name: tiers tiers_level_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tiers
    ADD CONSTRAINT tiers_level_key UNIQUE (level);


--
-- Name: tiers tiers_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tiers
    ADD CONSTRAINT tiers_name_key UNIQUE (name);


--
-- Name: tiers tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tiers
    ADD CONSTRAINT tiers_pkey PRIMARY KEY (id);


--
-- Name: time_slots time_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.time_slots
    ADD CONSTRAINT time_slots_pkey PRIMARY KEY (id);


--
-- Name: token_ledger token_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_ledger
    ADD CONSTRAINT token_ledger_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_app2_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_app2_transaction_id_key UNIQUE (app2_transaction_id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_partner_connections unique_connection; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_partner_connections
    ADD CONSTRAINT unique_connection UNIQUE (user_id, partner_id);


--
-- Name: deal_slots unique_deal_slot; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_slots
    ADD CONSTRAINT unique_deal_slot UNIQUE (deal_id, date, time_slot);


--
-- Name: partners unique_nfc_tag; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT unique_nfc_tag UNIQUE (nfc_tag_id);


--
-- Name: user_category_preferences unique_preference; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_category_preferences
    ADD CONSTRAINT unique_preference UNIQUE (user_id, category_id);


--
-- Name: referrals unique_referral; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT unique_referral UNIQUE (referrer_id, referred_user_id);


--
-- Name: user_achievements unique_user_achievement; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT unique_user_achievement UNIQUE (user_id, achievement_id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_auth_credentials user_auth_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_auth_credentials
    ADD CONSTRAINT user_auth_credentials_pkey PRIMARY KEY (id);


--
-- Name: user_auth_credentials user_auth_credentials_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_auth_credentials
    ADD CONSTRAINT user_auth_credentials_user_id_key UNIQUE (user_id);


--
-- Name: user_category_preferences user_category_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_category_preferences
    ADD CONSTRAINT user_category_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_partner_connections user_partner_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_partner_connections
    ADD CONSTRAINT user_partner_connections_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_firebase_uid_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_firebase_uid_key UNIQUE (firebase_uid);


--
-- Name: users users_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_number_key UNIQUE (phone_number);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_key UNIQUE (code);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_ezt_cinemas_city; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_cinemas_city ON ezt.cinemas USING btree (city);


--
-- Name: idx_ezt_cinemas_location; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_cinemas_location ON ezt.cinemas USING btree (latitude, longitude);


--
-- Name: idx_ezt_cinemas_partner; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_cinemas_partner ON ezt.cinemas USING btree (partner_id);


--
-- Name: idx_ezt_movies_active; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_movies_active ON ezt.movies USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_ezt_movies_genre; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_movies_genre ON ezt.movies USING gin (genre);


--
-- Name: idx_ezt_movies_language; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_movies_language ON ezt.movies USING gin (language);


--
-- Name: idx_ezt_movies_release_date; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_movies_release_date ON ezt.movies USING btree (release_date);


--
-- Name: idx_ezt_seat_bookings_locked_until; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_seat_bookings_locked_until ON ezt.seat_bookings USING btree (locked_until) WHERE ((status)::text = 'locked'::text);


--
-- Name: idx_ezt_seat_bookings_seat; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_seat_bookings_seat ON ezt.seat_bookings USING btree (seat_id);


--
-- Name: idx_ezt_seat_bookings_show; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_seat_bookings_show ON ezt.seat_bookings USING btree (show_id);


--
-- Name: idx_ezt_seat_bookings_status; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_seat_bookings_status ON ezt.seat_bookings USING btree (status);


--
-- Name: idx_ezt_seat_bookings_user; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_seat_bookings_user ON ezt.seat_bookings USING btree (user_id);


--
-- Name: idx_ezt_seats_row; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_seats_row ON ezt.seats USING btree (screen_id, row_label);


--
-- Name: idx_ezt_seats_screen; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_seats_screen ON ezt.seats USING btree (screen_id);


--
-- Name: idx_ezt_shows_cinema; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_shows_cinema ON ezt.shows USING btree (cinema_id);


--
-- Name: idx_ezt_shows_date_time; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_shows_date_time ON ezt.shows USING btree (show_date, show_time);


--
-- Name: idx_ezt_shows_movie; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_shows_movie ON ezt.shows USING btree (movie_id);


--
-- Name: idx_ezt_shows_screen; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_shows_screen ON ezt.shows USING btree (screen_id);


--
-- Name: idx_ezt_shows_status; Type: INDEX; Schema: ezt; Owner: postgres
--

CREATE INDEX idx_ezt_shows_status ON ezt.shows USING btree (status);


--
-- Name: idx_appointments_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_appointments_customer ON public.appointments USING btree (customer_id);


--
-- Name: idx_appointments_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_appointments_date ON public.appointments USING btree (appointment_date);


--
-- Name: idx_appointments_professional; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_appointments_professional ON public.appointments USING btree (professional_id);


--
-- Name: idx_approval_requests_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_approval_requests_status ON public.approval_requests USING btree (status);


--
-- Name: idx_beverage_categories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beverage_categories_active ON public.beverage_categories USING btree (is_active);


--
-- Name: idx_bookings_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_date ON public.bookings USING btree (booking_date);


--
-- Name: idx_bookings_date_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_date_time ON public.bookings USING btree (booking_date, booking_time);


--
-- Name: idx_bookings_deal_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_deal_id ON public.bookings USING btree (deal_id);


--
-- Name: idx_bookings_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_event ON public.bookings USING btree (event_id);


--
-- Name: idx_bookings_partner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_partner ON public.bookings USING btree (partner_id);


--
-- Name: idx_bookings_pre_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_pre_order ON public.bookings USING btree (is_pre_order) WHERE (is_pre_order = true);


--
-- Name: idx_bookings_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_reference ON public.bookings USING btree (booking_reference);


--
-- Name: idx_bookings_slot_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_slot_id ON public.bookings USING btree (slot_id);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_bookings_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_type ON public.bookings USING btree (booking_type);


--
-- Name: idx_bookings_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_user ON public.bookings USING btree (user_id);


--
-- Name: idx_categories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_categories_active ON public.categories USING btree (is_active);


--
-- Name: idx_check_ins_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_check_ins_category ON public.check_ins USING btree (category_id);


--
-- Name: idx_check_ins_partner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_check_ins_partner ON public.check_ins USING btree (partner_id);


--
-- Name: idx_check_ins_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_check_ins_timestamp ON public.check_ins USING btree (checked_in_at);


--
-- Name: idx_check_ins_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_check_ins_user ON public.check_ins USING btree (user_id);


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_deal_slots_available; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deal_slots_available ON public.deal_slots USING btree (is_available, date);


--
-- Name: idx_deal_slots_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deal_slots_date ON public.deal_slots USING btree (date);


--
-- Name: idx_deal_slots_deal_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deal_slots_deal_id ON public.deal_slots USING btree (deal_id);


--
-- Name: idx_dish_categories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dish_categories_active ON public.dish_categories USING btree (is_active);


--
-- Name: idx_event_bookings_booking_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_bookings_booking_reference ON public.event_bookings USING btree (booking_reference);


--
-- Name: idx_event_bookings_menu_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_bookings_menu_item_id ON public.event_bookings USING btree (menu_item_id);


--
-- Name: idx_event_bookings_menu_item_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_bookings_menu_item_status ON public.event_bookings USING btree (menu_item_id, status);


--
-- Name: idx_event_bookings_partner_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_bookings_partner_id ON public.event_bookings USING btree (partner_id);


--
-- Name: idx_event_bookings_reference; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_bookings_reference ON public.event_bookings USING btree (booking_reference);


--
-- Name: idx_event_bookings_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_bookings_status ON public.event_bookings USING btree (status);


--
-- Name: idx_event_bookings_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_bookings_user ON public.event_bookings USING btree (user_id, created_at DESC);


--
-- Name: idx_event_bookings_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_bookings_user_id ON public.event_bookings USING btree (user_id);


--
-- Name: idx_event_categories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_active ON public.event_categories USING btree (is_active);


--
-- Name: idx_event_categories_display_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_display_order ON public.event_categories USING btree (display_order);


--
-- Name: idx_event_categories_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_categories_parent ON public.event_categories USING btree (parent_category_id);


--
-- Name: idx_event_subcategories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_subcategories_active ON public.event_subcategories USING btree (is_active);


--
-- Name: idx_event_subcategories_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_subcategories_category ON public.event_subcategories USING btree (category_id);


--
-- Name: idx_event_subcategories_display_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_subcategories_display_order ON public.event_subcategories USING btree (display_order);


--
-- Name: idx_event_tags_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_tags_active ON public.event_tags USING btree (is_active);


--
-- Name: idx_event_tags_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_tags_type ON public.event_tags USING btree (tag_type);


--
-- Name: idx_event_tickets_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_tickets_event_id ON public.event_tickets USING btree (event_id);


--
-- Name: idx_event_tickets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_tickets_status ON public.event_tickets USING btree (status);


--
-- Name: idx_event_tickets_ticket_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_tickets_ticket_code ON public.event_tickets USING btree (ticket_code);


--
-- Name: idx_event_tickets_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_tickets_user_id ON public.event_tickets USING btree (user_id);


--
-- Name: idx_events_availability; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_availability ON public.events USING btree (booking_cap, seats_booked) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_events_start_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_start_time ON public.events USING btree (start_time);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_events_venue ON public.events USING btree (venue_id);


--
-- Name: idx_food_categories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_food_categories_active ON public.food_categories USING btree (is_active);


--
-- Name: idx_health_records_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_health_records_customer ON public.health_records USING btree (customer_id);


--
-- Name: idx_menu_items_available; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_available ON public.menu_items USING btree (is_available);


--
-- Name: idx_menu_items_beverage_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_beverage_category ON public.menu_items USING btree (beverage_category_id);


--
-- Name: idx_menu_items_dish_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_dish_category ON public.menu_items USING btree (dish_category_id);


--
-- Name: idx_menu_items_event_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_event_date ON public.menu_items USING btree (event_date);


--
-- Name: idx_menu_items_food_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_food_category ON public.menu_items USING btree (food_category_id);


--
-- Name: idx_menu_items_offer_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_offer_dates ON public.menu_items USING btree (offer_start_date, offer_end_date) WHERE (is_on_offer = true);


--
-- Name: idx_menu_items_offers; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_offers ON public.menu_items USING btree (partner_id, is_on_offer, offer_start_date, offer_end_date) WHERE ((is_on_offer = true) AND (is_available = true));


--
-- Name: idx_menu_items_on_offer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_on_offer ON public.menu_items USING btree (is_on_offer) WHERE (is_on_offer = true);


--
-- Name: idx_menu_items_partner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_partner ON public.menu_items USING btree (partner_id);


--
-- Name: idx_menu_items_service_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_service_category ON public.menu_items USING btree (service_category_id);


--
-- Name: idx_menu_items_service_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_service_type ON public.menu_items USING btree (service_type);


--
-- Name: idx_menu_items_trending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_trending ON public.menu_items USING btree (is_trending);


--
-- Name: idx_offer_schedule_days_schedule; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offer_schedule_days_schedule ON public.offer_schedule_days USING btree (offer_schedule_id, day_of_week);


--
-- Name: idx_offer_schedule_menu_items_menu; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offer_schedule_menu_items_menu ON public.offer_schedule_menu_items USING btree (menu_item_id);


--
-- Name: idx_offer_schedule_menu_items_schedule; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offer_schedule_menu_items_schedule ON public.offer_schedule_menu_items USING btree (offer_schedule_id);


--
-- Name: idx_offer_schedules_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offer_schedules_active ON public.offer_schedules USING btree (is_active, start_date, end_date);


--
-- Name: idx_offer_schedules_partner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offer_schedules_partner ON public.offer_schedules USING btree (partner_id);


--
-- Name: idx_offer_usage_schedule; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offer_usage_schedule ON public.offer_usage USING btree (offer_schedule_id);


--
-- Name: idx_offer_usage_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offer_usage_user ON public.offer_usage USING btree (user_id);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at);


--
-- Name: idx_orders_partner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_partner ON public.orders USING btree (partner_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_otp_phone_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_phone_verified ON public.otp_sessions USING btree (phone_number, verified, expires_at);


--
-- Name: idx_otp_sessions_phone_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_sessions_phone_verified ON public.otp_sessions USING btree (phone_number, verified, verified_at);


--
-- Name: idx_otp_sessions_registration; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_otp_sessions_registration ON public.otp_sessions USING btree (phone_number, used_for_registration, verified_at);


--
-- Name: idx_partner_analytics_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_analytics_created ON public.partner_analytics USING btree (created_at);


--
-- Name: idx_partner_analytics_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_analytics_org ON public.partner_analytics USING btree (organization_id);


--
-- Name: idx_partner_analytics_organization; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_analytics_organization ON public.partner_analytics USING btree (organization_id);


--
-- Name: idx_partner_analytics_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_analytics_period ON public.partner_analytics USING btree (period_start, period_end);


--
-- Name: idx_partner_offers_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_offers_active ON public.partner_offers USING btree (is_active, end_date);


--
-- Name: idx_partner_offers_applicable_menu_items; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_offers_applicable_menu_items ON public.partner_offers USING gin (applicable_menu_items);


--
-- Name: idx_partner_offers_discount_applies_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_offers_discount_applies_to ON public.partner_offers USING btree (discount_applies_to);


--
-- Name: idx_partner_offers_menu_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_offers_menu_item_id ON public.partner_offers USING btree (menu_item_id);


--
-- Name: idx_partner_offers_partner_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_offers_partner_id ON public.partner_offers USING btree (partner_id);


--
-- Name: idx_partner_offers_service_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_offers_service_type ON public.partner_offers USING btree (service_type);


--
-- Name: idx_partner_offers_trending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_offers_trending ON public.partner_offers USING btree (is_trending);


--
-- Name: idx_partner_organizations_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_organizations_active ON public.partner_organizations USING btree (is_active);


--
-- Name: idx_partner_organizations_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_organizations_parent ON public.partner_organizations USING btree (parent_org_id);


--
-- Name: idx_partner_organizations_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_organizations_type ON public.partner_organizations USING btree (type);


--
-- Name: idx_partner_otps_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_otps_lookup ON public.partner_otps USING btree (partner_id, type, is_used, expires_at);


--
-- Name: idx_partner_stores_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_stores_active ON public.partner_stores USING btree (is_active);


--
-- Name: idx_partner_stores_organization; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_stores_organization ON public.partner_stores USING btree (organization_id);


--
-- Name: idx_partner_users_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_users_active ON public.partner_users USING btree (is_active);


--
-- Name: idx_partner_users_organization; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partner_users_organization ON public.partner_users USING btree (organization_id);


--
-- Name: idx_partners_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partners_active ON public.partners USING btree (is_active);


--
-- Name: idx_partners_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partners_category ON public.partners USING btree (category_id);


--
-- Name: idx_partners_category_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partners_category_active ON public.partners USING btree (category_id, is_active) WHERE (is_active = true);


--
-- Name: idx_partners_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_partners_location ON public.partners USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));


--
-- Name: idx_pre_order_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pre_order_items_order ON public.pre_order_items USING btree (pre_order_id);


--
-- Name: idx_pre_orders_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pre_orders_date ON public.pre_orders USING btree (order_date);


--
-- Name: idx_pre_orders_partner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pre_orders_partner ON public.pre_orders USING btree (partner_id);


--
-- Name: idx_pre_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pre_orders_status ON public.pre_orders USING btree (status);


--
-- Name: idx_pre_orders_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pre_orders_user ON public.pre_orders USING btree (user_id);


--
-- Name: idx_professionals_partner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_professionals_partner ON public.professionals USING btree (partner_id);


--
-- Name: idx_referral_codes_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_referral_codes_user ON public.referral_codes USING btree (user_id);


--
-- Name: idx_reviews_professional; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_professional ON public.reviews USING btree (professional_id);


--
-- Name: idx_reviews_rating; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_rating ON public.reviews USING btree (rating);


--
-- Name: idx_service_categories_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_service_categories_slug ON public.service_categories USING btree (slug);


--
-- Name: idx_service_subcategories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_service_subcategories_active ON public.service_subcategories USING btree (is_active);


--
-- Name: idx_service_subcategories_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_service_subcategories_type ON public.service_subcategories USING btree (service_type);


--
-- Name: idx_templates_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_templates_org ON public.standardization_templates USING btree (organization_id);


--
-- Name: idx_templates_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_templates_type ON public.standardization_templates USING btree (template_type);


--
-- Name: idx_token_ledger_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_token_ledger_category ON public.token_ledger USING btree (category_id);


--
-- Name: idx_token_ledger_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_token_ledger_timestamp ON public.token_ledger USING btree (created_at);


--
-- Name: idx_token_ledger_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_token_ledger_user ON public.token_ledger USING btree (user_id);


--
-- Name: idx_transactions_app2_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_app2_id ON public.transactions USING btree (app2_transaction_id);


--
-- Name: idx_transactions_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_category ON public.transactions USING btree (category_id);


--
-- Name: idx_transactions_partner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_partner ON public.transactions USING btree (partner_id);


--
-- Name: idx_transactions_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_timestamp ON public.transactions USING btree (created_at);


--
-- Name: idx_transactions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);


--
-- Name: idx_user_category_pref; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_category_pref ON public.user_category_preferences USING btree (user_id, category_id);


--
-- Name: idx_user_partner_conn; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_partner_conn ON public.user_partner_connections USING btree (user_id, partner_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone_number, country_code);


--
-- Name: idx_users_tier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_tier ON public.users USING btree (current_tier_id);


--
-- Name: idx_vouchers_booking_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vouchers_booking_id ON public.vouchers USING btree (booking_id);


--
-- Name: idx_vouchers_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vouchers_code ON public.vouchers USING btree (code);


--
-- Name: idx_vouchers_partner_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vouchers_partner_id ON public.vouchers USING btree (partner_id);


--
-- Name: idx_vouchers_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vouchers_status ON public.vouchers USING btree (status);


--
-- Name: idx_webhook_logs_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_logs_category ON public.webhook_logs USING btree (category_id);


--
-- Name: idx_webhook_logs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_logs_status ON public.webhook_logs USING btree (status);


--
-- Name: cinemas ezt_update_cinemas_updated_at; Type: TRIGGER; Schema: ezt; Owner: postgres
--

CREATE TRIGGER ezt_update_cinemas_updated_at BEFORE UPDATE ON ezt.cinemas FOR EACH ROW EXECUTE FUNCTION ezt.update_updated_at_column();


--
-- Name: movies ezt_update_movies_updated_at; Type: TRIGGER; Schema: ezt; Owner: postgres
--

CREATE TRIGGER ezt_update_movies_updated_at BEFORE UPDATE ON ezt.movies FOR EACH ROW EXECUTE FUNCTION ezt.update_updated_at_column();


--
-- Name: shows ezt_update_shows_updated_at; Type: TRIGGER; Schema: ezt; Owner: postgres
--

CREATE TRIGGER ezt_update_shows_updated_at BEFORE UPDATE ON ezt.shows FOR EACH ROW EXECUTE FUNCTION ezt.update_updated_at_column();


--
-- Name: beverage_categories update_beverage_categories_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_beverage_categories_updated_at BEFORE UPDATE ON public.beverage_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bookings update_bookings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: categories update_categories_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_categories_timestamp BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: dish_categories update_dish_categories_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_dish_categories_updated_at BEFORE UPDATE ON public.dish_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_bookings update_event_bookings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_event_bookings_updated_at BEFORE UPDATE ON public.event_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: food_categories update_food_categories_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_food_categories_updated_at BEFORE UPDATE ON public.food_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: offer_schedules update_offer_schedules_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_offer_schedules_timestamp BEFORE UPDATE ON public.offer_schedules FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: partners update_partners_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_partners_timestamp BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: reviews update_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: service_categories update_service_categories_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_service_categories_updated_at BEFORE UPDATE ON public.service_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transactions update_transactions_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_transactions_timestamp BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: users update_users_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: cinemas cinemas_partner_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.cinemas
    ADD CONSTRAINT cinemas_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: screens screens_cinema_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.screens
    ADD CONSTRAINT screens_cinema_id_fkey FOREIGN KEY (cinema_id) REFERENCES ezt.cinemas(id) ON DELETE CASCADE;


--
-- Name: seat_bookings seat_bookings_booking_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seat_bookings
    ADD CONSTRAINT seat_bookings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: seat_bookings seat_bookings_seat_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seat_bookings
    ADD CONSTRAINT seat_bookings_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES ezt.seats(id) ON DELETE CASCADE;


--
-- Name: seat_bookings seat_bookings_show_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seat_bookings
    ADD CONSTRAINT seat_bookings_show_id_fkey FOREIGN KEY (show_id) REFERENCES ezt.shows(id) ON DELETE CASCADE;


--
-- Name: seat_bookings seat_bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seat_bookings
    ADD CONSTRAINT seat_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seats seats_screen_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.seats
    ADD CONSTRAINT seats_screen_id_fkey FOREIGN KEY (screen_id) REFERENCES ezt.screens(id) ON DELETE CASCADE;


--
-- Name: shows shows_cinema_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.shows
    ADD CONSTRAINT shows_cinema_id_fkey FOREIGN KEY (cinema_id) REFERENCES ezt.cinemas(id) ON DELETE CASCADE;


--
-- Name: shows shows_movie_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.shows
    ADD CONSTRAINT shows_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES ezt.movies(id) ON DELETE CASCADE;


--
-- Name: shows shows_screen_id_fkey; Type: FK CONSTRAINT; Schema: ezt; Owner: postgres
--

ALTER TABLE ONLY ezt.shows
    ADD CONSTRAINT shows_screen_id_fkey FOREIGN KEY (screen_id) REFERENCES ezt.screens(id) ON DELETE CASCADE;


--
-- Name: achievements achievements_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: appointments appointments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: approval_requests approval_requests_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.partner_users(id);


--
-- Name: approval_requests approval_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.partner_users(id);


--
-- Name: approval_requests approval_requests_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.approval_workflows(id);


--
-- Name: approval_workflows approval_workflows_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.approval_workflows
    ADD CONSTRAINT approval_workflows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.partner_organizations(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.partner_offers(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_show_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_show_id_fkey FOREIGN KEY (show_id) REFERENCES ezt.shows(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.deal_slots(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: check_ins check_ins_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: check_ins check_ins_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: check_ins check_ins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.check_ins
    ADD CONSTRAINT check_ins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: compliance_audits compliance_audits_auditor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_audits
    ADD CONSTRAINT compliance_audits_auditor_id_fkey FOREIGN KEY (auditor_id) REFERENCES public.partner_users(id);


--
-- Name: compliance_audits compliance_audits_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_audits
    ADD CONSTRAINT compliance_audits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.partner_organizations(id);


--
-- Name: compliance_audits compliance_audits_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_audits
    ADD CONSTRAINT compliance_audits_standard_id_fkey FOREIGN KEY (standard_id) REFERENCES public.quality_standards(id);


--
-- Name: compliance_audits compliance_audits_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_audits
    ADD CONSTRAINT compliance_audits_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.partner_stores(id);


--
-- Name: deal_slots deal_slots_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_slots
    ADD CONSTRAINT deal_slots_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.partner_offers(id) ON DELETE CASCADE;


--
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_attributes event_attributes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_attributes
    ADD CONSTRAINT event_attributes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_bookings event_bookings_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_bookings
    ADD CONSTRAINT event_bookings_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: event_bookings event_bookings_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_bookings
    ADD CONSTRAINT event_bookings_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: event_bookings event_bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_bookings
    ADD CONSTRAINT event_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_categories event_categories_parent_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES public.event_categories(id);


--
-- Name: event_subcategories event_subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_subcategories
    ADD CONSTRAINT event_subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.event_categories(id) ON DELETE CASCADE;


--
-- Name: event_tag_mappings event_tag_mappings_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tag_mappings
    ADD CONSTRAINT event_tag_mappings_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_tag_mappings event_tag_mappings_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tag_mappings
    ADD CONSTRAINT event_tag_mappings_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.event_tags(id) ON DELETE CASCADE;


--
-- Name: event_tickets event_tickets_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tickets
    ADD CONSTRAINT event_tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_tickets event_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_tickets
    ADD CONSTRAINT event_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: health_records health_records_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.health_records
    ADD CONSTRAINT health_records_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: health_records health_records_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.health_records
    ADD CONSTRAINT health_records_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;


--
-- Name: localization_settings localization_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.localization_settings
    ADD CONSTRAINT localization_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.partner_organizations(id);


--
-- Name: localization_settings localization_settings_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.localization_settings
    ADD CONSTRAINT localization_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.partner_stores(id);


--
-- Name: menu_items menu_items_beverage_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_beverage_category_id_fkey FOREIGN KEY (beverage_category_id) REFERENCES public.beverage_categories(id);


--
-- Name: menu_items menu_items_dish_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_dish_category_id_fkey FOREIGN KEY (dish_category_id) REFERENCES public.dish_categories(id);


--
-- Name: menu_items menu_items_food_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_food_category_id_fkey FOREIGN KEY (food_category_id) REFERENCES public.food_menu_categories(id);


--
-- Name: menu_items menu_items_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_service_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_service_category_id_fkey FOREIGN KEY (service_category_id) REFERENCES public.service_categories(id);


--
-- Name: offer_schedule_days offer_schedule_days_offer_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedule_days
    ADD CONSTRAINT offer_schedule_days_offer_schedule_id_fkey FOREIGN KEY (offer_schedule_id) REFERENCES public.offer_schedules(id) ON DELETE CASCADE;


--
-- Name: offer_schedule_menu_items offer_schedule_menu_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedule_menu_items
    ADD CONSTRAINT offer_schedule_menu_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: offer_schedule_menu_items offer_schedule_menu_items_offer_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedule_menu_items
    ADD CONSTRAINT offer_schedule_menu_items_offer_schedule_id_fkey FOREIGN KEY (offer_schedule_id) REFERENCES public.offer_schedules(id) ON DELETE CASCADE;


--
-- Name: offer_schedules offer_schedules_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_schedules
    ADD CONSTRAINT offer_schedules_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: offer_usage offer_usage_offer_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_usage
    ADD CONSTRAINT offer_usage_offer_schedule_id_fkey FOREIGN KEY (offer_schedule_id) REFERENCES public.offer_schedules(id) ON DELETE CASCADE;


--
-- Name: offer_usage offer_usage_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_usage
    ADD CONSTRAINT offer_usage_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: offer_usage offer_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offer_usage
    ADD CONSTRAINT offer_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: orders orders_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_analytics partner_analytics_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_analytics
    ADD CONSTRAINT partner_analytics_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.partner_organizations(id);


--
-- Name: partner_analytics partner_analytics_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_analytics
    ADD CONSTRAINT partner_analytics_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.partner_stores(id);


--
-- Name: partner_auth partner_auth_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_auth
    ADD CONSTRAINT partner_auth_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_category_metadata partner_category_metadata_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_category_metadata
    ADD CONSTRAINT partner_category_metadata_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: partner_category_metadata partner_category_metadata_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_category_metadata
    ADD CONSTRAINT partner_category_metadata_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_hours partner_hours_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_hours
    ADD CONSTRAINT partner_hours_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_images partner_images_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_images
    ADD CONSTRAINT partner_images_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_offers partner_offers_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_offers
    ADD CONSTRAINT partner_offers_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: partner_offers partner_offers_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_offers
    ADD CONSTRAINT partner_offers_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_organizations partner_organizations_parent_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_organizations
    ADD CONSTRAINT partner_organizations_parent_org_id_fkey FOREIGN KEY (parent_org_id) REFERENCES public.partner_organizations(id);


--
-- Name: partner_otps partner_otps_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_otps
    ADD CONSTRAINT partner_otps_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: partner_stores partner_stores_local_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_stores
    ADD CONSTRAINT partner_stores_local_manager_id_fkey FOREIGN KEY (local_manager_id) REFERENCES public.partner_users(id);


--
-- Name: partner_stores partner_stores_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_stores
    ADD CONSTRAINT partner_stores_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.partner_organizations(id);


--
-- Name: partner_stores partner_stores_parent_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_stores
    ADD CONSTRAINT partner_stores_parent_store_id_fkey FOREIGN KEY (parent_store_id) REFERENCES public.partner_stores(id);


--
-- Name: partner_users partner_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partner_users
    ADD CONSTRAINT partner_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.partner_organizations(id);


--
-- Name: partners partners_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: payment_methods payment_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pre_order_items pre_order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pre_order_items
    ADD CONSTRAINT pre_order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: pre_order_items pre_order_items_pre_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pre_order_items
    ADD CONSTRAINT pre_order_items_pre_order_id_fkey FOREIGN KEY (pre_order_id) REFERENCES public.pre_orders(id) ON DELETE CASCADE;


--
-- Name: pre_orders pre_orders_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pre_orders
    ADD CONSTRAINT pre_orders_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: prescriptions prescriptions_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: prescriptions prescriptions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: prescriptions prescriptions_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;


--
-- Name: professionals professionals_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.professionals
    ADD CONSTRAINT professionals_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: quality_standards quality_standards_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quality_standards
    ADD CONSTRAINT quality_standards_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.partner_organizations(id);


--
-- Name: referral_codes referral_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referral_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referral_code_id_fkey FOREIGN KEY (referral_code_id) REFERENCES public.referral_codes(id);


--
-- Name: referrals referrals_referred_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: screens screens_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: screens screens_theatre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.screens
    ADD CONSTRAINT screens_theatre_id_fkey FOREIGN KEY (theatre_id) REFERENCES public.theatres(id) ON DELETE CASCADE;


--
-- Name: standardization_templates standardization_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.standardization_templates
    ADD CONSTRAINT standardization_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.partner_users(id);


--
-- Name: standardization_templates standardization_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.standardization_templates
    ADD CONSTRAINT standardization_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.partner_organizations(id);


--
-- Name: support_tickets support_tickets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: theatres theatres_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.theatres
    ADD CONSTRAINT theatres_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;


--
-- Name: tier_progress tier_progress_current_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tier_progress
    ADD CONSTRAINT tier_progress_current_tier_id_fkey FOREIGN KEY (current_tier_id) REFERENCES public.tiers(id);


--
-- Name: tier_progress tier_progress_previous_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tier_progress
    ADD CONSTRAINT tier_progress_previous_tier_id_fkey FOREIGN KEY (previous_tier_id) REFERENCES public.tiers(id);


--
-- Name: tier_progress tier_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tier_progress
    ADD CONSTRAINT tier_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: time_slots time_slots_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.time_slots
    ADD CONSTRAINT time_slots_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;


--
-- Name: token_ledger token_ledger_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_ledger
    ADD CONSTRAINT token_ledger_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: token_ledger token_ledger_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_ledger
    ADD CONSTRAINT token_ledger_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: token_ledger token_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_ledger
    ADD CONSTRAINT token_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: transactions transactions_check_in_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_check_in_id_fkey FOREIGN KEY (check_in_id) REFERENCES public.check_ins(id);


--
-- Name: transactions transactions_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_user_tier_at_transaction_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_tier_at_transaction_fkey FOREIGN KEY (user_tier_at_transaction) REFERENCES public.tiers(id);


--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_auth_credentials user_auth_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_auth_credentials
    ADD CONSTRAINT user_auth_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_category_preferences user_category_preferences_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_category_preferences
    ADD CONSTRAINT user_category_preferences_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: user_category_preferences user_category_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_category_preferences
    ADD CONSTRAINT user_category_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_partner_connections user_partner_connections_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_partner_connections
    ADD CONSTRAINT user_partner_connections_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: user_partner_connections user_partner_connections_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_partner_connections
    ADD CONSTRAINT user_partner_connections_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: user_partner_connections user_partner_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_partner_connections
    ADD CONSTRAINT user_partner_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: vouchers vouchers_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: vouchers vouchers_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: vouchers vouchers_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: vouchers vouchers_redeemed_by_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_redeemed_by_partner_id_fkey FOREIGN KEY (redeemed_by_partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;


--
-- Name: webhook_logs webhook_logs_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- PostgreSQL database dump complete
--

\unrestrict OdElzBCDb4ZjT7mG6C9df7VIxaBBsVrajTFwKvBShyeAIklolhtb74wwi1jPxWf

--
-- Database "postgres" dump
--

\connect postgres

--
-- PostgreSQL database dump
--

\restrict lyvihFfPprEOmJoLCzMIl536PvLiOZsxaLrdLjelDFUGDRKKhndT13NepC7ZJlL

-- Dumped from database version 16.10 (Homebrew)
-- Dumped by pg_dump version 16.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- PostgreSQL database dump complete
--

\unrestrict lyvihFfPprEOmJoLCzMIl536PvLiOZsxaLrdLjelDFUGDRKKhndT13NepC7ZJlL

--
-- PostgreSQL database cluster dump complete
--

