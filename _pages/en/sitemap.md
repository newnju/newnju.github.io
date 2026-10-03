---
layout: archive
title: "Site Map"
permalink: /en/sitemap/
locale: en
author_profile: true
---

{% include base_path %}

Every page and entry on this site is listed below. There is also an [XML version]({{ base_path }}/sitemap.xml) for search engines. The Chinese-language pages have their own map at [the Chinese site map](/sitemap/).

<h2>Pages</h2>
{%- comment -%}
  English pages only (locale contains 'en'); the Chinese pages belong to the
  /sitemap/ map, so the two maps do not duplicate each other.
{%- endcomment -%}
{% for post in site.pages %}
  {% assign _pl = post.locale | default: '' %}
  {% if _pl contains 'en' %}
    {% unless post.url == page.url or post.sitemap == false %}
      {% include archive-single.html %}
    {% endunless %}
  {% endif %}
{% endfor %}

<h2>Publications</h2>
{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}

<h2>Projects</h2>
{% for post in site.portfolio %}
  {% include archive-single.html %}
{% endfor %}

<h2>Talks and Summer Schools</h2>
{% for post in site.talks %}
  {% include archive-single-talk.html %}
{% endfor %}

<h2>Teaching</h2>
{% for post in site.teaching reversed %}
  {% include archive-single.html %}
{% endfor %}
